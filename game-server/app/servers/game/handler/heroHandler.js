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

    listDef(msg, session, next) {
        this.safe(models.HeroDef.allP()
        .then((defs) => {
            next(null, {
                defs: _.map(defs, (hd) => { return hd.toClientObj(); })
            });
        }), next);
    }

    listBallistic(msg, session, next) {
        this.safe(models.Ballistic.allP()
        .then(function (data) {
            var dict = {};
            for (var i=0;i<data.length;i++) {
                dict[data[i].id] = data[i].value;
            }
            next(null, dict);
        }), next);
    }

    list(msg, session, next) {
        var roleId = session.get("role").id;
        this.safe(models.Hero.allP({where: {owner: roleId}})
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

        var equipment, itemDef, hero;

        if (!eqId || !heroId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this.getEquipmentWithDef(eqId)
        .spread((_equipment, _itemDef) => {
            equipment = _equipment;
            itemDef = _itemDef;
            if (_equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }

            return [models.Hero.findP(heroId), models.Item.allP({where: {bound: heroId}})];
        })
        .spread((_hero, equipments) => {
            hero = _hero;
            if (!hero || hero.owner !== role.id) {
                return Promise.reject(Constants.HeroFailed.DO_NOT_OWN_HERO);
            }
            if (equipments.length === 4 || _.findWhere(equipments, {itemDefId: equipment.itemDefId})) {
                return Promise.reject(Constants.HeroFailed.ALREADY_EQUIPPED);
            }
            return models.HeroDef.findP(hero.heroDefId);
        })
        .then((heroDef) => {
            if (!_.contains(heroDef.canEquip, itemDef.type)) {
                return Promise.reject(Constants.HeroFailed.CANNOT_EQUIP_WEAPON_TYPE);
            }
            equipment.bound = hero.id;
            return equipment.saveP();
        })
        .then((equipment) => {
            next(null, {
                equipment: equipment.toClientObj()
            });
            logger.logInfo("hero.equip", {
                role: this.toLogObj(role),
                hero: hero.toLogObj(),
                equipment: equipment.toLogObj()
            });
        }), next);
    }

    unEquip(msg, session, next) {
        var eqId = msg.equipmentId;
        var role = session.get("role");

        if (!eqId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        var heroId;

        this.safe(this.getEquipmentWithDef(eqId)
        .spread((equipment, _itemDef) => {
            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            heroId = equipment.bound;
            equipment.bound = null;
            return equipment.saveP();
        })
        .then((equipment) => {
            next(null, {
                equipment: equipment.toClientObj()
            });
            logger.logInfo("hero.unEquip", {
                role: this.toLogObj(role),
                heroId: heroId,
                equipment: equipment.toLogObj()
            });
        }), next);
    }
}
