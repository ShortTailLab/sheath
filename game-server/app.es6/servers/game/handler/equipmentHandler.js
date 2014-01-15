var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
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

        var matQuery = models.Item.allP({where: {owner: role.id, itemDefId: matType}, limit: 2});
        var itemDefQuery = models.ItemDef.findP(matType);

        this.safe(Promise.join(matQuery, itemDefQuery).bind(this)
        .spread((mats, itemDef) => {
            if (mats.length < 2 || !itemDef) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (itemDef.type !== "WEP" && itemDef.type !== "ARP") {
                return Promise.reject(Constants.InvalidRequest);
            }

            var matchExpr = "^" + itemDef.type.substr(0, 2) + "_";
            var targetQuery = models.ItemDef.allP({where: {
                quality: itemDef.quality,
                type: {match: matchExpr}
            }, sample: 1});
            return [mats, itemDef, targetQuery];
        })
        .all().spread((mats, itemDef, targets) => {
            if (targets.length !== 1) {
                return Promise.reject(Constants.InternalServerError);
            }

            return [mats, models.Item.createP({owner: role.id, itemDefId: targets[0].id}), mats[0].destroyP(), mats[1].destroyP()];
        })
        .all().spread((mats, newItem) => {
            next(null, {
                destroyed: [mats[0].id, mats[1].id],
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
        .all().spread((_equipment, _itemDef) => {
            [equipment, itemDef] = [_equipment, _itemDef];

            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.refinement >= 3) {
                return Promise.reject(Constants.EquipmentFailed.LEVEL_MAX);
            }
            return models.Item.findOneP({where: {
                owner: role.id,
                itemDefId: equipment.itemDefId,
                refinement: 0,
                refineProgress: 0,
                level: 0,
                bound: null,
                id: {ne: equipment.id}
            }});
        })
        .then((material) => {
            if (!material) {
                return Promise.reject(Constants.EquipmentFailed.NO_MATERIAL);
            }
            var progressReq = [2, 4, 6][equipment.refinement];

            equipment.refineProgress += 1;
            if (equipment.refineProgress === progressReq) {
                equipment.refineProgress = 0;
                equipment.refinement += 1;
            }
            return [material, material.destroyP(), equipment.saveP()];
        })
        .all().spread((material) => {
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

        var equipment, itemDef, stoneRequired;

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this.getEquipmentWithDef(eqId)
        .all().spread((_equipment, _itemDef) => {
            [equipment, itemDef] = [_equipment, _itemDef];

            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.level >= weaponLevelLimit) {
                return Promise.reject(Constants.EquipmentFailed.LEVEL_MAX);
            }

            var enforceStoneId = parseInt(this.app.get("dataService").get("specialItemId").data.enpowerStone.itemId);
            stoneRequired = Math.max(1, Math.floor(equipment.level/10));

            return [models.Item.allP({where: {owner: role.id, itemDefId: enforceStoneId}, limit: stoneRequired}),
                    models.Role.findP(role.id)];
        })
        .all().spread((stones, role) => {
            if (stones.length < stoneRequired) {
                return Promise.reject(Constants.EquipmentFailed.NO_ENFORCEMENT_STONE);
            }

            var coinsNeeded = 100;
            if (role.coins < coinsNeeded) {
                return Promise.reject(Constants.NO_COINS);
            }
            role.coins -= coinsNeeded;
            equipment.level += 1;

            var destroyAll = Promise.all(_.map(stones, (s) => {return s.destroyP();}));
            return [coinsNeeded, role.saveP(), stones,  destroyAll, equipment.saveP()];
        })
        .all().spread((coinsSpent, roleObj, stones) => {
            next(null, {
                destroyed: _.pluck(stones, "id"),
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
                stones: _.pluck(stones, "id"),
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
        .all().spread((mats) => {
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
        var equipment, eqPrefix, boundGemCount;

        this.safe(this.getEquipmentWithDef(eqId)
        .all().spread((_equipment, itemDef) => {
            if (itemDef.quality < 1) {
                return Promise.reject(Constants.EquipmentFailed.QUALITY_TOO_LOW);
            }
            if (_equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            equipment = _equipment;
            eqPrefix = itemDef.type.substr(0, 5);
            return this.getGemWithDef(gemId);
        })
        .all().spread((gem, itemDef) => {
            if (gem.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (gem.bound && gem.bound !== equipment.id) {
                return Promise.reject(Constants.EquipmentFailed.ALREADY_BOUND);
            }
            var gemEqMap = this.app.get("dataService").get("gemEqMap").data;
            if (!gemEqMap[eqPrefix][itemDef.type]) {
                return Promise.reject(Constants.EquipmentFailed.CANNOT_BIND_GEM_TYPE);
            }
            return [gem, models.Item.countP({bound: eqId})];
        })
        .all().spread((gem, _boundGemCount) => {
            boundGemCount = _boundGemCount;
            if (boundGemCount >= 3) {
                return Promise.reject(Constants.EquipmentFailed.NO_SLOT);
            }

            gem.bound = equipment.id;
            return gem.saveP();
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
        .all().spread((gem) => {
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
        .all().spread((result, role) => {
            role.coins += result.coins;

            var createPieces = Promise.all(_.map(_.range(result.pieces[1]), () => {
                return models.Item.createP({itemDefId: result.pieces[0], owner: role.id});
            }));
            var createStones = Promise.all(_.map(_.range(result.stones[1]), () => {
                return models.Item.createP({itemDefId: result.stones[0], owner: role.id});
            }));
            var unBoundGem = models.Item.updateP({where: {bound: result.equipment.id}, update: {bound: null}});
            return [result, role.saveP(), createPieces, createStones, unBoundGem, result.equipment.destroyP()];
        })
        .all().spread((result, roleObj, pieces, stones) => {
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
                newItems: _.invoke(pieces, "toClientObj").concat(_.invoke(stones, "toClientObj"))
            });
            logger.logInfo("equipment.removeGem", {
                role: this.toLogObj(roleObj),
                equipment: result.equipment.toLogObj(),
                equipmentCreateTime: result.equipment.createTime,
                gemIds: result.gems,
                newItems: _.invoke(pieces, "toLogObj").concat(_.invoke(stones, "toLogObj"))
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
                stoneId: result.stones[0],
                stoneCount: result.stones[1],
                gems: result.gems
            });
        }), next);
    }

    _genDestructMemory(eqId, role) {
        var specialItemIds = this.app.get("dataService").get("specialItemId").data;
        return this.getEquipmentWithDef(eqId)
        .all().spread((equipment, itemDef) => {
            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (equipment.bound) {
                return Promise.reject(Constants.EquipmentFailed.ALREADY_BOUND);
            }
            if (!equipment.destructMemory || equipment.refinement !== equipment.destructMemory.refinement || equipment.refineProgress !== equipment.destructMemory.refineProgress) {
                var pieceId;
                if (itemDef.type.startsWith("WE_R_")) {
                    pieceId = parseInt(specialItemIds.WEP.itemId);
                }
                else {
                    pieceId = parseInt(specialItemIds.ARP.itemId);
                }
                var matCount = [0, 2, 6, 12][equipment.refinement] + equipment.refineProgress + 1;
                var pieceCount = 0;
                for (let i=0, m=Math.min(matCount, itemDef.destructCoeff.length);i<m;i++) {
                    let coeff = itemDef.destructCoeff[i];
                    if (coeff) {
                        let randValue = Math.random();
                        if (randValue > coeff)
                            pieceCount += 2;
                        else
                            pieceCount += 1;
                    }
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
        .all().spread((equipment, itemDef, gems) => {
            var stoneId = parseInt(specialItemIds.enpowerStone.itemId);
            return {
                coins: itemDef.price + equipment.level * 100 * 0.3,
                stones: [stoneId, Math.floor(equipment.stoneUsed * 0.8)],
                pieces: equipment.destructMemory.pieces,
                gems: _.pluck(gems, "id"),

                equipment: equipment
            };
        });
    }
}
