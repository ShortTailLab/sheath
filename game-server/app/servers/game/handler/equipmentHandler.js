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

    composite(msg, session, next) {
        wrapSession(session);

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
                return Promise.reject(Constants.EquipmentFailed.NO_MATERIAL);
            }
            var promises = _.invoke(mats, "destroyP");
            promises.unshift((new models.Item({owner: role.id, itemDefId: target.id})).save());

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
        var equipment, itemDef;
        var material;

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(Promise.join(this.getEquipmentWithDef(eqId), models.Role.get(role.id).run())
        .spread((eqs, _role) => {
            [equipment, itemDef] = eqs;
            role = _role;

            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.refinement >= itemDef.refineLevel) {
                return Promise.reject(Constants.EquipmentFailed.LEVEL_MAX);
            }

            var coinReq = itemDef.refineCoin.length ? itemDef.refineCoin[0] : 0;
            if (role.coins < coinReq) {
                return Promise.reject(Constants.NO_COINS);
            }
            else {
                role.coins -= coinReq;
            }

            return models.Item.getAll(role.id, {index: "owner"}).filter({
                itemDefId: equipment.itemDefId,
                refinement: 0,
                level: 0
            }).filter({bound: null}, {default: true}).filter(r.row("id").ne(equipment.id)).limit(1).run();
        })
        .then((mats) => {
            if (!mats || mats.length === 0) {
                return Promise.reject(Constants.EquipmentFailed.NO_MATERIAL);
            }
            equipment.refinement += 1;
            material = mats[0];
            return [role.save(), material.delete(), equipment.save()];
        })
        .all().then(() => {
            next(null, {
                role: role.toSlimClientObj(),
                destroyed: material.id,
                equipment: equipment.toClientObj()
            });
            logger.logInfo("equipment.refine", {
                role: this.toLogObj(role),
                material: material.toLogObj(),
                newItem: equipment.toLogObj()
            });
        }), next);
    }

    upgrade(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");
        var weaponLevelLimit = Math.min(role.level, 99);

        var equipment, itemDef;

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(Promise.join(this.getEquipmentWithDef(eqId), models.Role.get(role.id).run())
        .spread((eqs, role) => {
            [equipment, itemDef] = eqs;
            var coinsNeeded = equipment.level * itemDef.upgradeCost;

            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.level >= weaponLevelLimit) {
                return Promise.reject(Constants.EquipmentFailed.LEVEL_MAX);
            }
            if (role.coins < coinsNeeded) {
                return Promise.reject(Constants.NO_COINS);
            }
            role.coins -= coinsNeeded;
            equipment.level += 1;
            session.set("role", role.toSessionObj());

            return [coinsNeeded, role.save(), equipment.save(), session.push("role")];
        })
        .spread((coinsSpent, roleObj) => {
            next(null, {
                equipment: equipment.toClientObj(),
                stateDiff: {
                    energy: roleObj.energy,
                    coins: roleObj.coins,
                    golds: roleObj.golds,
                    contribs: roleObj.contribs,

                    energyDiff: 0,
                    coinsDiff: -coinsSpent,
                    goldsDiff: 0,
                    contribsDiff: 0
                }
            });
            logger.logInfo("equipment.upgrade", {
                role: this.toLogObj(roleObj),
                spentCoin: coinsSpent,
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
                return Promise.reject(Constants.EquipmentFailed.NO_SLOT);
            }
            if (!equipment || equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (!gem || gem.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (gem.bound) {
                return Promise.reject(Constants.EquipmentFailed.ALREADY_BOUND);
            }
            if (itemDef.gemType.indexOf(gemDef.subType) === -1) {
                return Promise.reject(Constants.EquipmentFailed.CANNOT_BIND_GEM_TYPE);
            }
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
                    return Promise.reject(Constants.EquipmentFailed.NO_SLOT);
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
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
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

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this._genDestructMemory(eqId, role)
        .then((result) => {
            return [result, models.Role.get(role.id).run()];
        })
        .spread((result, role) => {
            role.coins += result.coins;

            var createPieces = Promise.all(_.map(_.range(result.pieces[1]), () => {
                return (new models.Item({itemDefId: result.pieces[0], owner: role.id})).save();
            }));
            var unBoundGem = models.Item.getAll(result.equipment.id, {index: "bound"}).update({bound: null}).run();
            return [result, role.save(), createPieces, unBoundGem, result.equipment.delete()];
        })
        .spread((result, roleObj, pieces) => {
            next(null, {
                stateDiff: {
                    energy: roleObj.energy,
                    coins: roleObj.coins,
                    golds: roleObj.golds,
                    contribs: roleObj.contribs,

                    energyDiff: 0,
                    coinsDiff: result.coins,
                    goldsDiff: 0,
                    contribsDiff: 0
                },
                removeGems: result.gems,
                newItems: _.invoke(pieces, "toClientObj")
            });
            logger.logInfo("equipment.removeGem", {
                role: this.toLogObj(roleObj),
                equipment: result.equipment.toLogObj(),
                equipmentCreateTime: result.equipment.createTime,
                gemIds: result.gems,
                newItems: _.invoke(pieces, "toLogObj")
            });
        }), next);
    }

    destructCheck(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this._genDestructMemory(eqId, role)
        .then((result) => {
            next(null, {
                coins: result.coins,
                pieceId: result.pieces[0],
                pieceCount: result.pieces[1],
//                stoneId: result.stones[0],
//                stoneCount: result.stones[1],
                gems: result.gems
            });
        }), next);
    }

    _genDestructMemory(eqId, role) {
        var cache = this.app.get("cache");
        return this.getEquipmentWithDef(eqId)
        .spread((equipment, itemDef) => {
            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.bound) {
                return Promise.reject(Constants.EquipmentFailed.ALREADY_BOUND);
            }
            if (!equipment.destructMemory || equipment.refinement !== equipment.destructMemory.refinement || equipment.refineProgress !== equipment.destructMemory.refineProgress) {
                var pieceId = cache.getPieceId(itemDef);
                var sumMat = [0];
                _.each(itemDef.refineCost, function (c) {
                    sumMat.push(sumMat[sumMat.length - 1] + c);
                });
                var iterCount = sumMat[equipment.refinement] + equipment.refineProgress + 1;
                var pieceCount = 0;
                var pieceCoeff = itemDef.destructPiece;
                for (var i=0;i<iterCount;i++) {
                    pieceCount += this.evalRandAtom(pieceCoeff);
                }

                equipment.destructMemory = {
                    refinement: equipment.refinement,
                    refineProgress: equipment.refineProgress,
                    pieces: [pieceId, pieceCount]
                };
                return [equipment.save(), itemDef, models.Item.getAll(equipment.id, {index: "bound"}).run()];
            }
            return [equipment, itemDef, models.Item.getAll(equipment.id, {index: "bound"}).run()];
        })
        .spread((equipment, itemDef, gems) => {
            return {
                coins: itemDef.price + equipment.level * 100 * 0.3,
                pieces: equipment.destructMemory.pieces,
                gems: _.pluck(gems, "id"),

                equipment: equipment
            };
        });
    }
}
