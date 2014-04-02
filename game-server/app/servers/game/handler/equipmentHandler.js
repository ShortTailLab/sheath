var models = require("../../../../../shared/models");
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
        this.safe(models.Item.allP({where: {owner: role.id, itemDefId: matType}, limit: itemDef.composeCount}).bind(this)
        .then((_mats) => {
            mats = _mats;
            if (mats.length < itemDef.composeCount) {
                return Promise.reject(Constants.EquipmentFailed.NO_MATERIAL);
            }
            var promises = _.invoke(mats, "destroyP");
            promises.unshift(models.Item.createP({owner: role.id, itemDefId: target.id}));

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

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this.getEquipmentWithDef(eqId)
        .spread((_equipment, _itemDef) => {
            [equipment, itemDef] = [_equipment, _itemDef];

            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.refinement >= itemDef.refineLevel) {
                return Promise.reject(Constants.EquipmentFailed.LEVEL_MAX);
            }
            return models.Item.findOneP({where: {
                owner: role.id,
                itemDefId: equipment.itemDefId,
                refinement: 0,
                level: 0,
                bound: null,
                id: {ne: equipment.id}
            }});
        })
        .then((material) => {
            if (!material) {
                return Promise.reject(Constants.EquipmentFailed.NO_MATERIAL);
            }
            equipment.refinement += 1;
            return [material, material.destroyP(), equipment.saveP()];
        })
        .spread((material) => {
            next(null, {
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

        this.safe(this.getEquipmentWithDef(eqId)
        .spread((_equipment, _itemDef) => {
            [equipment, itemDef] = [_equipment, _itemDef];

            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.level >= weaponLevelLimit) {
                return Promise.reject(Constants.EquipmentFailed.LEVEL_MAX);
            }

            return models.Role.findP(role.id);
        })
        .then((role) => {
            var coinsNeeded = equipment.level * itemDef.upgradeCost;
            if (role.coins < coinsNeeded) {
                return Promise.reject(Constants.NO_COINS);
            }
            role.coins -= coinsNeeded;
            equipment.level += 1;
            session.set("role", role.toSessionObj());

            return [coinsNeeded, role.saveP(), equipment.saveP(), session.push("role")];
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

    refineGem(msg, session, next) {
        wrapSession(session);

        var gemType = msg.gemType;
        var gemLevel = msg.gemLevel;
        var role = session.get("role");

        if (!gemType || gemLevel < 0 || gemLevel >= 10) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(models.Item.allP({where: {owner: role.id, itemDefId: gemType, level: gemLevel, bound: null}, limit: 2}).bind(this)
        .then((mats) => {
            if (mats.length < 2) {
                return Promise.reject(Constants.EquipmentFailed.NO_MATERIAL);
            }
            mats[0].level += 1;
            return [mats, mats[0].saveP(), mats[1].destroyP()];
        })
        .spread((mats) => {
            next(null, {
                destroyed: mats[1].id,
                gem: mats[0].toClientObj()
            });
            logger.logInfo("equipment.refineGem", {
                role: this.toLogObj(role),
                materail: mats[1].toLogObj(),
                refined: mats[0].toLogObj()
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
        var equipment, itemDef, gemDef, eqPrefix, boundGemCount;

        this.safe(this.getEquipmentWithDef(eqId)
        .spread((_equipment, _itemDef) => {
            itemDef = _itemDef;
            if (itemDef.slots === 0) {
                return Promise.reject(Constants.EquipmentFailed.NO_SLOT);
            }
            if (!_equipment || _equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            equipment = _equipment;
            eqPrefix = itemDef.type.substr(0, 5);
            return this.getGemWithDef(gemId);
        })
        .spread((gem, _gemDef) => {
            gemDef = _gemDef;
            if (!gem || gem.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (gem.bound) {
                return Promise.reject(Constants.EquipmentFailed.ALREADY_BOUND);
            }
            if (itemDef.gemType.indexOf(gemDef.subType) === -1) {
                return Promise.reject(Constants.EquipmentFailed.CANNOT_BIND_GEM_TYPE);
            }
            return [gem, models.Item.allP({where: {bound: eqId}})];
        })
        .spread((gem, _boundGems) => {
            boundGemCount = _boundGems.length;
            var cache = this.app.get("cache");
            // find a same type gem to replace
            var toReplace = _.find(_boundGems, function (gem) {
                var def = cache.itemDefById[gem.itemDefId];
                return def ? def.subType === gemDef.subType : null;
            });
            gem.bound = equipment.id;
            if (toReplace) {
                toReplace.bound = null;
                return toReplace.saveP().then(function () {
                    return gem.saveP();
                });
            }
            else {
                if (_boundGems.length + 1 > itemDef.slots) {
                    return Promise.reject(Constants.EquipmentFailed.NO_SLOT);
                }
                return gem.saveP();
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
            return gem.saveP();
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
            return [result, models.Role.findP(role.id)];
        })
        .spread((result, role) => {
            role.coins += result.coins;

            var createPieces = Promise.all(_.map(_.range(result.pieces[1]), () => {
                return models.Item.createP({itemDefId: result.pieces[0], owner: role.id});
            }));
            var unBoundGem = models.Item.updateP({where: {bound: result.equipment.id}, update: {bound: null}});
            return [result, role.saveP(), createPieces, unBoundGem, result.equipment.destroyP()];
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
                return [equipment.saveP(), itemDef, models.Item.allP({where: {bound: equipment.id}})];
            }
            return [equipment, itemDef, models.Item.allP({where: {bound: equipment.id}})];
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
