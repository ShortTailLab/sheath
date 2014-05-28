var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var ItemDAO = require("../../../../../shared/dao/item");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("lodash");
var logger;


module.exports = function (app) {
    return new RoleHandler(app);
};

class RoleHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        this.formationLevelReq = [0, 10, 15, 20, 25, 30];
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    replaceHero(msg, session, next) {
        var oldHeroId = msg.hero || null;
        var newHeroId = msg.with;
        var role = session.get("role");

        if (!newHeroId) {
            return this.errorNext(Constants.HeroFailed.DO_NOT_OWN_HERO, next);
        }
        if (!_.contains(role.team, oldHeroId)) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(models.Hero.get(newHeroId).run().bind(this)
        .then(function (newHero) {
            if (newHero.owner !== role.id) {
                return Promise.reject(Constants.HeroFailed.DO_NOT_OWN_HERO);
            }
            var cache = this.app.get("cache");
            if (role.team.length > 3) role.team = role.team.slice(0, 3);
            for (var i=0;i<role.team.length;i++) {
                if (role.team[i] === oldHeroId) {
                    role.team[i] = newHeroId;
                    break;
                }
            }
            session.set("role", role);
            return [session.push("role"), models.Role.get(role.id).update({team: role.team}).run()];
        })
        .all().then(function (){
            next(null, {});
            logger.logInfo("role.replaceHero", {
                oldHero: oldHeroId,
                newHero: newHeroId
            });
        }), next);
    }

    setTeam(msg, session, next) {
        wrapSession(session);

        var heroList = msg.heroes;
        var formation = msg.formation;
        var role = session.get("role");

        if (heroList.length !== 5 || !heroList[0]) {
            this.errorNext(Constants.InvalidRequest, next);
        }
        else if (formation < 0 || formation >= this.formationLevelReq.length || role.level < this.formationLevelReq[formation]) {
            this.errorNext(Constants.RoleFailed.NO_FORMATION, next);
        }
        else {
            for (var i=0;i<5;i++) {
                heroList[i] = heroList[i] || null;
            }

            var reqHeroes = _.compact(heroList);
            this.safe(Promise.join(models.Role.get(role.id).run(), models.Hero.getAll.apply(models.Hero, reqHeroes).count().execute()).bind(this)
            .spread(function(r, heroCount) {
                role = r;
                if (reqHeroes.length !== heroCount) {
                    return Promise.reject(Constants.RoleFailed.DO_NOT_OWN_HERO);
                }
                role.setTeam(formation, heroList);
                role.formation = formation;
                session.set("role", role.toSessionObj());
                return [role.save(), session.push("role")];
            })
            .all().then(() => {
                next(null, {
                    role: role.toClientObj()
                });
                logger.logInfo("role.setTeam", {
                    role: role.toLogObj(),
                    team: heroList,
                    formation: formation
                });
            }), next);
        }
    }

    upgradeFormation(msg, session, next) {
        wrapSession(session);

        var formation = msg.formation;
        var role = session.get("role");
        var specialItemIds = this.app.get("specialItemId");
        var formLevelMax = Math.min(Math.floor(role.level/5), 100);

        if (formation < 0 || formation >= this.formationLevelReq.length || role.level < this.formationLevelReq[formation]) {
            return this.errorNext(Constants.RoleFailed.NO_FORMATION, next);
        }

        this.safe(Promise.join(models.Role.get(role.id).run(), ItemDAO.getFormationBook(specialItemIds, formation)).bind(this)
        .spread(function(r, books) {
            role = r;
            var curFormationLevel = role.formationLevel[formation];
            if (curFormationLevel > formLevelMax) {
                return Promise.reject(Constants.RoleFailed.FORMATION_LEVEL_MAX);
            }
        }), next);
    }

    claimDailyReward(msg, session, next) {
        wrapSession(session);

        var role = session.get("role");
        if (!role.dailyRefreshData.dailyReward) {
            role.dailyRefreshData.dailyReward = true;
            var rewardConf = this.app.get("rewardConfig").daily;

            this.safe(models.Role.get(role.id).run().bind(this)
            .then((roleObj) => {
                roleObj.coins += rewardConf.coins;
                roleObj.golds += rewardConf.golds;
                roleObj.contribs += rewardConf.contribs;
                roleObj.energy += rewardConf.energy;
                roleObj.dailyRefreshData.dailyReward = true;

                session.set("role", roleObj.toSessionObj());
                return [roleObj.save(), session.push("role")];
            })
            .spread((roleObj) => {
                var rewardDict = {
                    energy: roleObj.energy,
                    coins: roleObj.coins,
                    golds: roleObj.golds,
                    contribs: roleObj.contribs,

                    energyDiff: rewardConf.energy,
                    coinsDiff: rewardConf.coins,
                    goldsDiff: rewardConf.golds,
                    contribsDiff: rewardConf.contribs
                };

                next(null, { reward: rewardDict });
                logger.logInfo("role.claimDaily", {
                    role: roleObj.toLogObj(),
                    reward: rewardDict
                });
            }), next);
        }
        else {
            this.errorNext(Constants.ALREADY_CLAIMED, next);
        }
    }

    claimQuarterHourlyReward(msg, session, next) {
        wrapSession(session);

        var role = session.get("role");
        var rewardConf = this.app.get("rewardConfig").qhourly;
        if ((role.dailyRefreshData.qhourlyReward || 0) < rewardConf.dailyLimit) {
            role.dailyRefreshData.qhourlyReward = (role.dailyRefreshData.qhourlyReward || 0) + 1;

            this.safe(models.Role.get(role.id).run().bind(this)
            .then((roleObj) => {
                roleObj.coins += rewardConf.coins;
                roleObj.golds += rewardConf.golds;
                roleObj.contribs += rewardConf.contribs;
                roleObj.energy += rewardConf.energy;
                roleObj.dailyRefreshData.qhourlyReward = (roleObj.dailyRefreshData.qhourlyReward || 0) + 1;

                session.set("role", roleObj.toSessionObj());
                return [roleObj.save(), session.push("role")];
            })
            .spread((roleObj) => {
                var rewardDict = {
                    energy: roleObj.energy,
                    coins: roleObj.coins,
                    golds: roleObj.golds,
                    contribs: roleObj.contribs,

                    energyDiff: rewardConf.energy,
                    coinsDiff: rewardConf.coins,
                    goldsDiff: rewardConf.golds,
                    contribsDiff: rewardConf.contribs
                };

                next(null, { reward: rewardDict });
                logger.logInfo("role.claimQH", {
                    role: roleObj.toLogObj(),
                    reward: rewardDict
                });
            }), next);
        }
        else {
            this.errorNext(Constants.ALREADY_CLAIMED, next);
        }
    }

    buyRoom(msg, session, next) {
        var role = session.get("role");

        this.safe(models.get(role.id).run().bind(this)
        .then((roleObj) => {
            if (roleObj.storageRoom === 125) {
                return Promise.reject(Constants.HeroFailed.STORAGE_MAX);
            }
            if (roleObj.golds < 25) {
                return Promise.reject(Constants.HeroFailed.NO_GOLDS);
            }
            roleObj.fillEnergy();
            roleObj.golds -= 25;
            roleObj.storageRoom += 5;
            session.set("role", roleObj.toSessionObj());
            return [roleObj.save(), session.push("role")];
        })
        .spread((roleObj) => {
            next(null, {
                role: roleObj.toClientObj()
            });
            logger.logInfo("role.buyRoom", {
                role: roleObj.toLogObj(),
                golds: 25
            });
        }), next);
    }
}
