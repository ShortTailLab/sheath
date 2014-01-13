var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
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
            this.errorNext(Constants.InvalidRequest, next);
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

            return [mats, models.Item.createP({itemDefId: targets[0].id, owner: role.id}), mats[0].destroyP(), mats[1].destroyP()];
        })
        .all().spread((mats, newItem) => {
            next(null, {
                destroyed: [mats[0].id, mats[1].id],
                newItem: newItem.toClientObj()
            });
        }), next);
    }

    refine(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");
        var equipment, itemDef;

        if (!eqId) {
            this.errorNext(Constants.InvalidRequest, next);
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
                level: 0
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
            return [material.id, material.destroyP(), equipment.saveP()];
        })
        .all().spread((mid) => {
            next(null, {
                destroyed: mid,
                equipment: equipment.toClientObj()
            });
        }), next);
    }

    upgrade(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");
        var weaponLevelLimit = role.level;

        var equipment, itemDef;

        if (!eqId) {
            this.errorNext(Constants.InvalidRequest, next);
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

            var enforceStoneId = parseInt(this.app.get("dataService").get("specialItemId").data.enforceStone.itemId);
            return [models.Item.findOneP({where: {owner: role.id, itemDefId: enforceStoneId}}),
                    models.Role.findP(role.id)];
        })
        .all().spread((stone, role) => {
            if (!stone) {
                return Promise.reject(Constants.EquipmentFailed.NO_ENFORCEMENT_STONE);
            }

            var coinsNeeded = 100;
            if (role.coins < coinsNeeded) {
                return Promise.reject(Constants.NO_COINS);
            }
            role.coins -= coinsNeeded;
            equipment.level += 1;

            return [coinsNeeded, role.saveP(), stone, stone.destroyP(), equipment.saveP()];
        })
        .all().spread((coinsSpent, roleObj, stone) => {
            next(null, {
                destroyed: stone.id,
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
        }), next);
    }

    setGem(msg, session, next) {
        wrapSession(session);
    }

    removeGem(msg, session, next) {
        wrapSession(session);
    }

    destruct(msg, session, next) {
        wrapSession(session);
    }
}
