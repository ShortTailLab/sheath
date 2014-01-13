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

    equip(msg, session, next) {
        var itemId = msg.itemId;
        var heroId = msg.heroId;
        var role = session.get("role");

        Promise.all(models.Role.findP(role.id), models.Item.findP(itemId))
        .spread((role, item) => {
            if (!role || !item || item.owner !== role.id) {
                this.errorNext(Constants.EquipmentFailed.DO_NOT_OWN_ITEM, next);
                return;
            }
        })
        .catch((err) => {
            this.errorNext(err, next);
        });
    }

    refine(msg, session, next) {
    }

    upgrade(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var role = session.get("role");
        var weaponLevelLimit = role.level;

        var equipment, itemDef;

        this.safe(this.getItemWithDef(eqId)
        .all().spread((_equipment, _itemDef) => {
            [equipment, itemDef] = [_equipment, _itemDef];

            if (equipment.owner !== role.id || !itemDef || !(itemDef.type.startsWith("WE_") || itemDef.type.startsWith("AR_"))) {
                return Promise.reject(Constants.InvalidRequest);
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
    }

    removeGem(msg, session, next) {
    }


}
