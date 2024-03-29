var models = require("../../../../../shared/models");
var r = models.r;
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
        var freeDraw = false;

        this.safe(models.Role.get(session.get("role").id).getJoin({heroes: true}).run().bind(this)
        .then(function (role) {
            var nextFreeTime = role.dailyRefreshData[this.app.mKey.coinDrawReset];
            var freeDrawCount = role.dailyRefreshData[this.app.mKey.coinDrawCount] || 0;
            var now = moment();

            if (freeReq) {
                if (freeDrawCount < 5 && (!nextFreeTime || moment(nextFreeTime).isBefore(now))) {
                    role.dailyRefreshData[this.app.mKey.coinDrawReset] = now.add(5, "minutes").toDate();
                    role.dailyRefreshData[this.app.mKey.coinDrawCount] = freeDrawCount + 1;
                    freeDraw = true;
                }
                else throw Constants.HeroFailed.NO_FREE_REFRESH;
            }
            else if (role.coins >= 10000) {
                role.coins -= 10000;
            }
            else {
                throw Constants.NO_COINS;
            }

            drawResult = draw.drawWithCoins(role, false, freeDraw);

            session.set("role", role.toSessionObj());
            return [role.save(), models.Hero.save(drawResult.heroes), models.Item.save(drawResult.items), session.push("role")];
        })
        .spread(function (role, newHeroes, newItems) {
            logger.logInfo("hero.coinDraw", {
                role: role.toLogObj(),
                newHero: _.invoke(newHeroes, "toLogObj"),
                newItem: _.invoke(newItems, "toLogObj"),
                souls: drawResult.souls,
                freeDraw: freeDraw,
                tenDraw: tenDraw
            });

            drawResult.role = role.toSlimClientObj();
            drawResult.heroes = _.invoke(newHeroes, "toClientObj");
            drawResult.items = _.invoke(newItems, "toClientObj");

            drawResult.nextGoldReset = Math.floor(moment(role.manualRefreshData[this.app.mKey.goldDrawReset] || undefined).diff() / 1000);
            drawResult.nextCoinReset = Math.floor(moment(role.dailyRefreshData[this.app.mKey.coinDrawReset] || undefined).diff() / 1000);
            drawResult.coinDrawCount = role.dailyRefreshData[this.app.mKey.coinDrawCount] || 0;
            next(null, drawResult);
        }), next);
    }

    goldDraw(msg, session, next) {
        wrapSession(session);
        draw.initOnce(this.app);
        var drawResult;
        var tenDraw = msg.tenDraw || false;
        var freeReq = msg.freeDraw || false;
        var freeDraw = false;

        this.safe(models.Role.get(session.get("role").id).getJoin({heroes: true}).run().bind(this)
        .then(function (role) {
            var nextFreeTime = role.manualRefreshData[this.app.mKey.goldDrawReset];
            var now = moment();
            if (tenDraw) {
                if (role.golds >= 2520) role.golds -= 2520;
                else throw Constants.NO_GOLDS;
            }
            else if (freeReq) {
                if (!nextFreeTime || moment(nextFreeTime).isBefore(now)) {
                    role.manualRefreshData[this.app.mKey.goldDrawReset] = now.add(48, "hours").toDate();
                    freeDraw = true;
                }
                else throw Constants.HeroFailed.NO_FREE_REFRESH;
            }
            else if (role.golds >= 280) {
                role.golds -= 280;
            }
            else {
                throw Constants.NO_GOLDS;
            }
            drawResult = draw.drawWithGolds(role, tenDraw, freeDraw);

            session.set("role", role.toSessionObj());
            return [role.save(), models.Hero.save(drawResult.heroes), models.Item.save(drawResult.items), session.push("role")];
        })
        .spread(function (role, newHeroes, newItems) {
            logger.logInfo("hero.goldDraw", {
                role: role.toLogObj(),
                newHero: _.invoke(newHeroes, "toLogObj"),
                newItem: _.invoke(newItems, "toLogObj"),
                souls: drawResult.souls,
                freeDraw: freeDraw,
                tenDraw: tenDraw
            });

            drawResult.role = role.toSlimClientObj();
            drawResult.heroes = _.invoke(newHeroes, "toClientObj");
            drawResult.items = _.invoke(newItems, "toClientObj");

            drawResult.nextGoldReset = Math.floor(moment(role.manualRefreshData[this.app.mKey.goldDrawReset] || undefined).diff() / 1000);
            drawResult.nextCoinReset = Math.floor(moment(role.dailyRefreshData[this.app.mKey.coinDrawReset] || undefined).diff() / 1000);
            drawResult.coinDrawCount = role.dailyRefreshData[this.app.mKey.coinDrawCount] || 0;

            next(null, drawResult);
        }), next);
    }

    queryDraw(msg, session, next) {
        wrapSession(session);
        var role = session.get("role");

        next(null, {
            nextGoldReset: Math.floor(moment(role.manualRefreshData[this.app.mKey.goldDrawReset] || undefined).diff() / 1000),
            nextCoinReset: Math.floor(moment(role.dailyRefreshData[this.app.mKey.coinDrawReset] || undefined).diff() / 1000),
            coinDrawCount: role.dailyRefreshData[this.app.mKey.coinDrawCount] || 0
        });
    }

    listRoleExtra(msg, session, next) {
        wrapSession(session);
        this.safe(models.Role.get(session.get("role").id).run().bind(this)
        .then(function (role) {
            next(null, {
                souls: role.souls,
                fragments: role.fragments
            });
        }), next);
    }

    redeemSouls(msg, session, next) {
        wrapSession(session);
        var heroId = msg.heroId;
        var heroDef = this.app.get("cache").heroDefById[heroId];
        var hero;

        this.safe(models.Role.get(session.get("role").id).getJoin({heroes: true}).run().bind(this)
        .then(function (role) {
            var soul = role.souls[heroId] || 0;
            if (!soul || !heroDef || soul < heroDef.counts) {
                throw Constants.HeroFailed.NOT_ENOUGH_SOULS;
            }
            if (_.findWhere(role.heroes, {heroDefId: heroId})) {
                throw Constants.HeroFailed.ALREADY_HAVE_HERO;
            }

            soul -= heroDef.counts;
            role.souls[heroId] = soul;
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
                souls: heroDef.counts
            });
        }), next);
    }

    refine(msg, session, next) {
        wrapSession(session);
        var heroId = msg.heroId;
        var matId = msg.matId;
        var role = session.get("role");
        var mat, heroDef;

        if (_.contains(role.team, matId) || heroId === matId) {
            return this.errorNext(Constants.HeroFailed.NO_MATERIAL_HERO, next);
        }

        this.safe(Promise.join(models.Hero.getAll(heroId, matId).run(), models.Role.get(role.id).run()).bind(this)
        .spread(function (heroes, _role) {
            var hero = heroes[0];
            mat = heroes[1];
            role = _role;
            if (!hero || !mat || hero.owner !== role.id || mat.owner !== role.id) {
                throw Constants.HeroFailed.DO_NOT_OWN_HERO;
            }
            if (hero.stars >= 4) {
                throw Constants.HeroFailed.REFINE_MAX;
            }
            if (hero.heroDefId !== mat.heroDefId) {
                throw Constants.HeroFailed.NO_MATERIAL_HERO;
            }
            if (hero.stars !== mat.stars) {
                throw Constants.HeroFailed.REFINE_LEVEL_NOT_MATCH;
            }
            heroDef = this.app.get("cache").heroDefById[hero.heroDefId];
            if (role.coins < heroDef.coinCost[hero.stars]) {
                throw Constants.NO_COINS;
            }

            heroDef.coinCost[hero.stars] = heroDef.coinCost[hero.stars] || 0;
            role.coins -= heroDef.coinCost[hero.stars];
            hero.stars += 1;
            session.set("role", role.toSessionObj());
            return [hero.save(), mat.delete(), role.save(), session.push("role")];
        })
        .spread(function (hero) {
            var coinCost = heroDef.coinCost[hero.stars - 1];
            next(null, {
                hero: hero.toClientObj(),
                destroyedHero: mat.id,
                coins: coinCost
            });
            logger.logInfo("hero.refine", {
                role: this.toLogObj(role),
                hero: hero.toLogObj(),
                destroyedHero: mat.toLogObj(),
                coins: coinCost
            });
        }), next);
    }

    destruct(msg, session, next) {
        wrapSession(session);
        var heroId = msg.heroId;

        this.save(Promise.join(models.Hero.get(heroId).run(), models.Role.get(session.get("role").id).run()).bind(this)
        .spread(function (hero, role) {
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
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            }
            if (!hero || hero.owner !== role.id) {
                throw Constants.HeroFailed.DO_NOT_OWN_HERO;
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
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
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
