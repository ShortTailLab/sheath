var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Bar = require("../../../services/barService");
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

    maxDailyRefresh(role) {
        var max = [0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
        if (0 <= role.vipLevel < max.length) {
            return max[role.vipLevel];
        }
        return max[0];
    }

    getRoleBar(role) {
        var bar = role.bar;

        if (!bar.validThru || bar.validThru * 1000 < Date.now()) {
            bar.validThru = Bar.nextRefresh;
            bar.recruited = [];
            bar.heroes = null;
        }

        if (bar.heroes && bar.validThru * 1000 >= Date.now()) {
            return bar.heroes;
        }
        else {
            return Bar.listHeroes();
        }
    }

    countId(list, id) {
        var count = 0;
        for (var i=0;i<list.length;i++) {
            if (list[i] === id) {
                ++count;
            }
        }
        return count;
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
        this.safe(models.Hero.allP({where: {owner: roleId}})
        .then((heroes) => {
            next(null, {
                heroes: _.map(heroes, (h) => { return h.toClientObj(); })
            });
        }), next);
    }

    listRecruit(msg, session, next) {
        wrapSession(session);
        Bar.initOnce(this.app);

        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
            var barHeroes = this.getRoleBar(role);

            next(null, {
                nextRefresh: Bar.nextRefresh - Date.now(),
                freeRefresh: this.maxDailyRefresh(role) - (role.dailyRefreshData.barRefreshNum || 0),
                recruited: role.bar.recruited || [],
                heroes: barHeroes
            });
        }), next);
    }

    freeRefresh(msg, session, next) {
        wrapSession(session);
        Bar.initOnce(this.app);

        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
            var freeRefresh = this.maxDailyRefresh(role) - (role.dailyRefreshData.barRefreshNum || 0);
            if (freeRefresh < 1) {
                return Promise.reject(Constants.HeroFailed.NO_FREE_REFRESH);
            }
            role.dailyRefreshData.barRefreshNum = (role.dailyRefreshData.barRefreshNum || 0) + 1;
            role.bar = {
                heroes: Bar.getFreeRefresh(role),
                recruited: [],
                validThru: Bar.nextRefresh
            };
            return role.saveP();
        })
        .then(function (role) {
            next(null, {
                nextRefresh: Bar.nextRefresh - Date.now(),
                freeRefresh: this.maxDailyRefresh(role) - (role.dailyRefreshData.barRefreshNum || 0),
                heroes: role.bar.heroes
            });
            logger.logInfo("bar.refresh.free", {
                role: role.toLogObj(),
                heroes: _.pluck(role.bar.heroes, "id")
            });
        }), next);
    }

    paidRefresh(msg, session, next) {
        wrapSession(session);
        Bar.initOnce(this.app);
        var tokenDefId = this.app.get("specialItemId").barRefreshToken;
        var role = session.get("role");
        var tokenId;
        if (tokenDefId === undefined || tokenDefId === null) {
            return this.errorNext(Constants.HeroFailed.NO_PAID_REFRESH, next);
        }

        this.safe(Promise.join(models.Role.findP(role.id), models.Item.findOneP({wherer: {owner: role.id, itemDefId: tokenDefId}})).bind(this)
        .spread(function (role, token) {
            tokenId = token.id;
            if (!token) {
                return Promise.reject(Constants.HeroFailed.NO_PAID_REFRESH);
            }
            role.bar = {
                heroes: Bar.getPaidRefresh(role),
                recruited: [],
                validThru: Bar.nextRefresh
            };
            return [role.saveP(), token.destroyP()];
        })
        .spread(function (role) {
            next(null, {
                destroyed: tokenId,
                nextRefresh: Bar.nextRefresh - Date.now(),
                freeRefresh: this.maxDailyRefresh(role) - (role.dailyRefreshData.barRefreshNum || 0),
                heroes: role.bar.heroes
            });
            logger.logInfo("bar.refresh.paid", {
                role: role.toLogObj(),
                heroes: _.pluck(role.bar.heroes, "id")
            });
        }), next);
    }

    recruit(msg, session, next) {
        wrapSession(session);

        var heroId = msg.heroId;
        var useGold = !!msg.useGold;
        var cache = this.app.get("cache");
        var role = session.get("role");
        var heroDraw = cache.heroDrawById[heroId];
        if (!heroDraw) {
            return this.errorNext(Constants.HeroFailed.NOT_IN_BAR, next);
        }

        this.safe(models.Role.findP(role.id).bind(this)
        .then(function (_role) {
            role = _role;
            var barHeroes = this.getRoleBar(role);
            var barHeroIds = _.pluck(barHeroes, "id");
            if (!_.contains(barHeroIds, heroId)) {
                return Promise.reject(Constants.HeroFailed.NOT_IN_BAR);
            }
            if (useGold && role.golds < heroDraw.golds) {
                return Promise.reject(Constants.NO_GOLDS);
            }
            if (!useGold && role.contribs < heroDraw.contribs) {
                return Promise.reject(Constants.NO_CONTRIBS);
            }
            if (this.countId(barHeroIds, heroId) <= this.countId(role.bar.recruited, heroId)) {
                return Promise.reject(Constants.HeroFailed.NOT_IN_BAR);
            }
            if (useGold) role.golds -= heroDraw.golds;
            else role.contribs -= heroDraw.contribs;
            role.bar.recruited.push(heroId);
            session.set("role", role.toSessionObj());
            return [role.saveP(), models.Hero.createP({owner: role.id, heroDefId: heroId, level: heroDraw.level}), session.push("role")];
        })
        .spread(function (role, hero) {
            next(null, {
                role: role.toClientObj(),
                newHero: hero.toClientObj()
            });
            logger.logInfo("bar.recruit", {
                role: role.toLogObj(),
                gold: useGold,
                price: useGold ? heroDraw.golds : heroDraw.contribs,
                newHero: hero.toLogObj()
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
            var cache = this.app.get("cache");
            // find a same type equipment to replace
            var toReplace = _.find(equipments, function (eq) {
                var def = cache.equipmentDefById[eq.itemDefId];
                return def ? def.type === itemDef.type : null;
            });

            equipment.bound = hero.id;
            if (toReplace) {
                toReplace.bound = null;
                return toReplace.saveP().then(function () {
                    return equipment.saveP();
                });
            }
            else {
                return equipment.saveP();
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
