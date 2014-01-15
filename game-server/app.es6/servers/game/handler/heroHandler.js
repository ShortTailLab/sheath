var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
var logger;


module.exports = function (app) {
    return new HeroHandler(app);
};

class HeroHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    list(msg, session, next) {
        var roleId = session.get("role").id;
        this.safe(models.Hero.allP({where: {owner: roleId}}).bind(this)
        .then((heroes) => {
            next(null, {
                heroes: _.map(heroes, (h) => { return h.toClientObj(); })
            });
        }), next);
    }

    recruit(msg, session, next) {

    }

    equip(msg, session, next) {
        var eqId = msg.equipmentId;
        var heroId = msg.heroId;
        var role = session.get("role");

        var equipment, itemDef;

        if (!eqId || !heroId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this.getEquipmentWithDef(eqId)
        .all().spread((_equipment, _itemDef) => {
            equipment = _equipment;
            itemDef = _itemDef;
            if (_equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }

            return [models.Hero.findP(heroId), models.Item.allP({where: {bound: equipment.id}})];
        })
        .all().spread((hero, equipments) => {
            if (hero.owner !== role.id) {
                return Promise.reject(Constants.HeroFailed.DO_NOT_OWN_HERO);
            }
        }), next);
    }

    unEquip(msg, session, next) {
    }
}
