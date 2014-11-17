var models = require("../../../../../shared/models");
var r = models.r;
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("lodash");
var logger;


module.exports = function (app) {
    return new EquipmentHandler(app);
};

class EquipmentHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    compositeByFragment(msg, session, next) {
        wrapSession(session);

        var equipDefId = msg.equipDefId;
        var equipDef = this.app.get("cache").getEquipDef(equipDefId);

        if(!equipDef) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        var counts = equipDef.counts;

        if(counts <= 0) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        var role = session.get("role");
        var fragments;
        var fragmentDefId = equipDefId * 10;
        this.safe(models.Item.getAll(role.id, {index: "owner"}).filter({itemDefId: fragmentDefId}).limit(counts)
        .run().bind(this).then((items) => {
            fragments = items;
            if(fragments.length < counts) {
                throw Constants.EquipmentFailed.NOT_ENOUGH_FRAGMENT;
            }
            var promises = _.invoke(fragments, "delete");
            promises.unshift(new models.Item({owner: role.id, itemDefId: equipDefId, bound: null}).save());

            return promises;
        })
        .spread((equip) => {
            next(null, {
                destroyed: _.pluck(fragments, "id"),
                equip: equip.toClientObj()
            });

            logger.logInfo("equipment.compositeByFragment", {
                role: this.toLogObj(role),
                fragments: _.invoke(fragments, "toLogObj"),
                newItem: equip.toLogObj()
            });
        }), next);
    }
    
    composite(msg, session, next) {
        wrapSession(session);
        return this.errorNext(Constants.InvalidRequest, next);

        var matType = msg.matType;
        var role = session.get("role");

        if (!matType) {
            return this.errorNext(Constants.InvalidRequest, next);
        }
        var cache = this.app.get("cache");
        var itemDef = cache.itemDefById[matType];
        var target = cache.randomCompositeTarget(itemDef);
        if (!target) {
            return this.errorNext(Constants.EquipmentFailed.NO_MATERIAL, next);
        }

        var mats;
        this.safe(models.Item.getAll(role.id, {index: "owner"}).filter({itemDefId: matType}).limit(itemDef.composeCount)
        .run().bind(this).then((_mats) => {
            mats = _mats;
            if (mats.length < itemDef.composeCount) {
                throw Constants.EquipmentFailed.NO_MATERIAL;
            }
            var promises = _.invoke(mats, "delete");
            promises.unshift((new models.Item({owner: role.id, itemDefId: target, bound: null})).save());

            return promises;
        })
        .spread((newItem) => {
            next(null, {
                destroyed: _.pluck(mats, "id"),
                newItem: newItem.toClientObj()
            });
            logger.logInfo("equipment.composite", {
                role: this.toLogObj(role),
                materials: [mats[0].toLogObj(), mats[1].toLogObj()],
                newItem: newItem.toLogObj()
            });
        }), next);
    }

    refine(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");
        var equipment, itemDef, ironIndex, coinReq, ironReq;
        var refineCostTable = this.app.get("refineTable").refineTable;
        var refineOptions, success, items;

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(Promise.join(this.getEquipmentWithDef(eqId), models.Role.get(role.id).run()).bind(this)
        .spread((eqs, _role) => {
            [equipment, itemDef] = eqs;
            role = _role;

            if (equipment.owner !== role.id) {
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            }
            if (equipment.refinement >= itemDef.refineLevel) {
                throw Constants.EquipmentFailed.LEVEL_MAX;
            }

            if (itemDef.ironType <= 0 || itemDef.ironType > 4) {
                throw Constants.InvalidRequest;
            }

            refineOptions = refineCostTable[equipment.refinement];
            ironIndex = itemDef.ironType - 1;
            coinReq = Math.ceil(refineOptions.coinCost * itemDef.refineFactor);
            ironReq = refineOptions.ironCost;

            if (role.coins < coinReq) {
                throw Constants.NO_COINS;
            }

            var ironItemDefId = this.app.get("specialItemId").ironItems[ironIndex];
            return models.Item.getAll(role.id, {index: "owner"}).filter({itemDefId: ironItemDefId}).limit(ironReq).run();
        })
        .then((_items) => {
            items = _items;
            if(items.length < ironReq) {
                throw Constants.NO_IRONS;
            }

            role.coins -= coinReq;
            var promises = _.invoke(items, "delete");

            if (Math.random() < (refineOptions.luck + (equipment.luck || 0))) {
                equipment.refinement += 1;
                equipment.luck = 0;
                success = true;
            }
            else {
                equipment.luck = (equipment.luck || 0) + refineOptions.luckGrowth;
                success = false;
            }

            promises.unshift(role.save(), equipment.save());
            return promises;
        })
        .all().then(() => {
            next(null, {
                role: role.toSlimClientObj(),
                delIrons: _.pluck(items, "id"),
                equipment: equipment.toClientObj()
            });
            logger.logInfo("equipment.refine", {
                role: this.toLogObj(role),
                equipment: equipment.toLogObj(),
                delIrons: _.invoke(items, "toClientObj"),
                success: success
            });
        }), next);
    }

    upgrade(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");
        var equipment, itemDef, coinsNeeded;

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(Promise.join(this.getEquipmentWithDef(eqId), models.Role.get(role.id).run())
        .spread((eqs, role) => {
            [equipment, itemDef] = eqs;
            var coinCostTable = this.app.get("growTable").coinCostTable;
            var weaponLevelLimit = Math.min(role.level, 80);
            coinsNeeded = Math.ceil(coinCostTable[equipment.level] * itemDef.growFactor);

            if (equipment.owner !== role.id) {
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            }
            if (equipment.level >= weaponLevelLimit) {
                throw Constants.EquipmentFailed.LEVEL_MAX;
            }
            if (role.coins < coinsNeeded) {
                throw Constants.NO_COINS;
            }
            role.coins -= coinsNeeded;
            equipment.level += 1;
            session.set("role", role.toSessionObj());

            return [role.save(), equipment.save(), session.push("role")];
        })
        .spread((roleObj) => {
            next(null, {
                equipment: equipment.toClientObj(),
                stateDiff: {
                    energy: roleObj.energy,
                    coins: roleObj.coins,
                    golds: roleObj.golds,
                    contribs: roleObj.contribs,

                    energyDiff: 0,
                    coinsDiff: -coinsNeeded,
                    goldsDiff: 0,
                    contribsDiff: 0
                }
            });
            logger.logInfo("equipment.upgrade", {
                role: this.toLogObj(roleObj),
                spentCoin: coinsNeeded,
                newItem: equipment.toLogObj()
            });
        }), next);
    }

    setGem(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var gemId = msg.gemId;
        var role = session.get("role");

        if (!eqId || !gemId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }
        var equipment, itemDef, gem, gemDef, boundGemCount;

        this.safe(Promise.join(this.getEquipmentWithDef(eqId), this.getGemWithDef(gemId))
        .spread((q1, q2) => {
            [equipment, itemDef] = q1;
            [gem ,gemDef] = q2;
            if (itemDef.slots === 0) {
                throw Constants.EquipmentFailed.NO_SLOT;
            }
            if (!equipment || equipment.owner !== role.id) {
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            }
            if (!gem || gem.owner !== role.id) {
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            }
            if (gem.bound) {
                throw Constants.EquipmentFailed.ALREADY_BOUND;
            }
//            if (itemDef.gemType.indexOf(gemDef.subType) === -1) {
//                throw Constants.EquipmentFailed.CANNOT_BIND_GEM_TYPE;
//            }
            return models.Item.getAll(eqId, {index: "bound"}).run();
        })
        .then((_boundGems) => {
            boundGemCount = _boundGems.length;
            var cache = this.app.get("cache");
            // find a same type gem to replace
            var toReplace = _.find(_boundGems, function (g) {
                var def = cache.itemDefById[g.itemDefId];
                return def ? def.subType === gemDef.subType : null;
            });
            gem.bound = equipment.id;
            if (toReplace) {
                toReplace.bound = null;
                return toReplace.save().then(function () {
                    return gem.save();
                });
            }
            else {
                if (_boundGems.length + 1 > itemDef.slots) {
                    throw Constants.EquipmentFailed.NO_SLOT;
                }
                return gem.save();
            }
        })
        .then((gem) => {
            next(null, { gem: gem.toClientObj() });
            logger.logInfo("equipment.setGem", {
                role: this.toLogObj(role),
                equipment: equipment.toLogObj(),
                boundGem: boundGemCount,
                gem: gem.toLogObj()
            });
        }), next);
    }

    removeGem(msg, session, next) {
        wrapSession(session);

        var gemId = msg.gemId;
        var role = session.get("role");
        var eqId;

        if (!gemId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this.getGemWithDef(gemId)
        .spread((gem) => {
            if (gem.owner !== role.id) {
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            }

            eqId = gem.bound;
            gem.bound = null;
            return gem.save();
        })
        .then((gem) => {
            next(null, { gem: gem.toClientObj() });
            logger.logInfo("equipment.removeGem", {
                role: this.toLogObj(role),
                equipmentId: eqId,
                gem: gem.toLogObj()
            });
        }), next);
    }

    destruct(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");
        var equipment, eqDef;
        var coins = 0, irons = 0;

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(Promise.join(this.getEquipmentWithDef(eqId), models.Role.get(role.id).run()).bind(this)
        .spread((eqWithDef, _role) => {
            [equipment, eqDef] = eqWithDef;
            role = _role;
            var coinCostTable = this.app.get("growTable").coinCostTable;
            var refineCostTable = this.app.get("refineTable").refineTable;
            coins = eqDef.coin;

            for (var i=1;i<equipment.level;i++) {
                coins += Math.ceil(Math.ceil(coinCostTable[i] * eqDef.growFactor) * eqDef.coinRecover);
            }

            var promises = [];
            var newIrons = [];
            if(eqDef.ironType <= 0) {
                irons = 0;
            }
            else {
                irons = eqDef.iron;
                var ironItemDefId = this.app.get("specialItemId").ironItems[eqDef.ironType - 1];
                for (var i=0;i<equipment.refinement;i++) {
                    var refineOption = refineCostTable[i];
                    coins += Math.ceil(Math.ceil(refineOption.coinCost * eqDef.refineFactor) * eqDef.coinRecover);
                    irons += Math.ceil(Math.ceil(refineOption.ironCost * eqDef.refineFactor) * eqDef.ironRecover);
                }

                for(var i = 0; i < irons; ++i) {
                    newIrons.push(new models.Item({owner: role.id, itemDefId: ironItemDefId, bound: null}).save());
                }
            }

            role.coins += coins;

            return [role.save(), Promise.all(newIrons), equipment.delete()];
        })
        .spread((roleObj, items) => {
            next(null, {
                role: roleObj.toClientObj(),
                destroyed: equipment.id,
                coins: coins,
                irons: _.invoke(items, "toClientObj")
            });
            logger.logInfo("equipment.destruct", {
                role: this.toLogObj(roleObj),
                equipment: equipment.toLogObj(),
                coins: coins,
                irons: _.invoke(items, "toLogObj")
            });
        }), next);
    }
}
