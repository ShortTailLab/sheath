var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var draw = require("../../../services/drawService");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var moment = require("moment");
var Promise = require("bluebird");
var _ = require("lodash");
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
        wrapSession(session);

        next(null, {
            defs: this.app.get("cache").clientHeroDefs
        });
    }

    list(msg, session, next) {
        wrapSession(session);

        var roleId = session.get("role").id;
        this.safe(models.Hero.getAll(roleId, {index: "owner"}).run()
        .then((heroes) => {
            next(null, {
                heroes: _.invoke(heroes, "toClientObj")
            });
        }), next);
    }

    coinDraw(msg, session, next) {
        wrapSession(session);
        draw.initOnce(this.app);
        var drawResult;
        var tenDraw = msg.tenDraw || false;
        var freeReq = msg.freeDraw || false;

        this.safe(models.Role.get(session.get("role").id).getJoin({heroes: true}).run().bind(this)
        .then(function (role) {
            var nextFreeTime = role.dailyRefreshData[this.app.mKey.coinDrawReset];
            var freeDrawCount = role.dailyRefreshData[this.app.mKey.coinDrawCount] || 0;
            var freeDraw = false;
            var now = moment();
            if (tenDraw) {
                if (role.coins >= 90000) role.coins -= 90000;
                else return Promise.reject(Constants.NO_COINS);
            }
            else if (freeReq) {
                if (freeDrawCount < 5 && (!nextFreeTime || moment(nextFreeTime).isBefore(now))) {
                    role.dailyRefreshData[this.app.mKey.coinDrawReset] = now.add(5, "minutes").toDate();
                    role.dailyRefreshData[this.app.mKey.coinDrawCount] = freeDrawCount + 1;
                    freeDraw = true;
                }
                else return Promise.reject(Constants.NO_FREE_REFRESH);
            }
            else if (role.coins >= 10000) {
                role.coins -= 10000;
            }
            else {
                return Promise.reject(Constants.NO_COINS);
            }
            drawResult = draw.drawWithCoins(role, tenDraw, freeDraw);
            var heroPromises = [];
            _.map(drawResult.heroes, function (h) {
                if (_.findWhere(role.heroes, {heroDefId: h.heroDefId})) {
                    var hId = "" + h.heroDefId;
                    h.id = "";
                    role.souls[hId] = (role.souls[hId] || 0) + 10;
                }
                else {
                    heroPromises.push(h.save());
                }
            });

            session.set("role", role.toSessionObj());
            return [role.save(), session.push("role"), heroPromises, Promise.all(_.invoke(drawResult.items, "save"))];
        })
        .spread(function (role) {
            drawResult.role = role.toSlimClientObj();
            drawResult.heroes = _.invoke(drawResult.heroes, "toClientObj");
            drawResult.items = _.invoke(drawResult.items, "toClientObj");
            next(null, drawResult);
        }), next);
    }

    goldDraw(msg, session, next) {
        wrapSession(session);
        draw.initOnce(this.app);
        var drawResult;
        var tenDraw = msg.tenDraw || false;
        var freeReq = msg.freeDraw || false;

        this.safe(models.Role.get(session.get("role").id).getJoin({heroes: true}).run()
        .then(function (role) {
            var nextFreeTime = role.manualRefreshData[this.app.mKey.goldDrawReset];
            var freeDraw = false;
            var now = moment();
            if (tenDraw) {
                if (role.golds >= 2800) role.golds -= 2800;
                else return Promise.reject(Constants.NO_GOLDS);
            }
            else if (freeReq) {
                if (!nextFreeTime || moment(nextFreeTime).isBefore(now)) {
                    role.manualRefreshData[this.app.mKey.goldDrawReset] = now.add(36, "hours").toDate();
                    freeDraw = true;
                }
                else return Promise.reject(Constants.NO_FREE_REFRESH);
            }
            else if (role.golds >= 300) {
                role.golds -= 300;
            }
            else {
                return Promise.reject(Constants.NO_GOLDS);
            }
            drawResult = draw.drawWithGolds(role, tenDraw, freeDraw);
            var heroPromises = [];
            _.map(drawResult.heroes, function (h) {
                if (_.findWhere(role.heroes, {heroDefId: h.heroDefId})) {
                    var hId = "" + h.heroDefId;
                    h.id = "";
                    role.souls[hId] = (role.souls[hId] || 0) + 10;
                }
                else {
                    heroPromises.push(h.save());
                }
            });

            session.set("role", role.toSessionObj());
            return [role.save(), session.push("role"), heroPromises, Promise.all(_.invoke(drawResult.items, "save"))];
        })
        .spread(function (role) {
            drawResult.role = role.toSlimClientObj();
            drawResult.heroes = _.invoke(drawResult.heroes, "toClientObj");
            drawResult.items = _.invoke(drawResult.items, "toClientObj");
            next(null, drawResult);
        }), next);
    }

    queryDraw(msg, session, next) {
        wrapSession(session);
        var role = session.get("role");

        next(null, {
            nextGoldReset: Math.floor(moment(role.manualRefreshData[this.app.mKey.goldDrawReset] || undefined).diff() / 1000),
            nextCoinReset: Math.floor(moment(role.manualRefreshData[this.app.mKey.coinDrawReset] || undefined).diff() / 1000),
            coinDrawCount: role.dailyRefreshData[this.app.mKey.coinDrawCount] || 0
        });
    }

    listSouls(msg, session, next) {
        wrapSession(session);

        this.safe(models.Role.get(session.get("role").id).run().bind(this)
        .then(function (role) {
            next(null, role.souls);
        }), next);
    }

    redeemSouls(msg, session, next) {
        wrapSession(session);
        var heroId = msg.heroId;
        var heroDef = this.app.get("cache").heroDefById[heroId];
        var hero;

        this.safe(models.Role.get(session.get("role").id).getJoin({heroes: true}).run().bind(this)
        .then(function (role) {
            var soul = role.souls["" + heroId] || 0;
            if (!soul || !heroDef || soul < heroDef.souls) {
                return Promise.reject(Constants.HeroFailed.NOT_ENOUGH_SOULS);
            }
            if (_.findWhere(role.heroes, {heroDefId: heroId})) {
                return Promise.reject(Constants.HeroFailed.ALREADY_HAVE_HERO);
            }
            soul -= heroDef.souls;
            role.souls["" + heroId] = soul;
            return (new models.Hero({owner: role.id, heroDefId: heroId})).save()
            .then(function (_hero) {
                hero = _hero;
                return role.save();
            });
        })
        .then(function (role) {
            next(null, {
                newHero: hero.toClientObj()
            });
            logger.logInfo("hero.redeemSoul", {
                role: role.toLogObj(),
                newHero: hero.toLogObj(),
                souls: heroDef.souls
            });
        }), next);
    }

    equip(msg, session, next) {
        wrapSession(session);

        var eqId = msg.equipmentId;
        var heroId = msg.heroId;
        var role = session.get("role");

        var equipment, itemDef, hero;

        if (!eqId || !heroId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(Promise.join(this.getEquipmentWithDef(eqId), models.Hero.get(heroId).getJoin({equipments: true}).run())
        .spread((eqs, _hero) => {
            equipment = eqs[0];
            itemDef = eqs[1];
            hero = _hero;
            if (equipment.owner !== role.id) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            if (!hero || hero.owner !== role.id) {
                return Promise.reject(Constants.HeroFailed.DO_NOT_OWN_HERO);
            }
            var cache = this.app.get("cache");
            // find a same type equipment to replace
            var toReplace = _.find(hero.equipments, function (eq) {
                var def = cache.equipmentDefById[eq.itemDefId];
                return def ? def.type === itemDef.type : null;
            });

            equipment.bound = hero.id;
            if (toReplace) {
                toReplace.bound = null;
                return toReplace.save().then(function () {
                    return equipment.save();
                });
            }
            else {
                return equipment.save();
            }
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
        wrapSession(session);

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
            return equipment.save();
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
