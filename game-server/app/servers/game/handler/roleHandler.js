var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var ItemDAO = require("../../../../../shared/dao/item");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
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

    changeName(msg, session, next) {
        wrapSession(session);

        var newName = msg.newName;
        var role = session.get("role");
        if (!newName || role.name === newName) {
            this.errorNext(Constants.InvalidRequest, next);
        }
        else {
            role.name = newName;
            session.set("role", role.toSessionObj());
            this.safe(Promise.all(models.User.updateAttributeP("name", newName), session.push("role")).bind(this)
            .then(() => {
                next(null, {
                });
            }), next);
        }
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
            this.safe(Promise.join(models.Role.findP(role.id), models.Hero.countP({id: {inq: reqHeroes}, owner: role.id})).bind(this)
            .spread(function(r, heroCount) {
                role = r;
                if (reqHeroes.length !== heroCount) {
                    return Promise.reject(Constants.RoleFailed.DO_NOT_OWN_HERO);
                }
                role.setTeam(formation, heroList);
                role.formation = formation;
                session.set("role", role.toSessionObj());
                return [role.updateAttributesP({team: heroList, formation: formation}), session.push("role")];
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
        var specialItemIds = this.app.get("dataService").get("specialItemId").data;
        var formLevelMax = Math.min(Math.floor(role.level/5), 100);

        if (formation < 0 || formation >= this.formationLevelReq.length || role.level < this.formationLevelReq[formation]) {
            return this.errorNext(Constants.RoleFailed.NO_FORMATION, next);
        }

        this.safe(Promise.join(models.Role.findP(role.id), ItemDAO.getFormationBook(specialItemIds, formation)).bind(this)
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
            var rewardConf = this.app.get("dataService").get("reward").data.daily;

            this.safe(models.Role.findP(role.id).bind(this)
            .then((roleObj) => {
                roleObj.coins += parseInt(rewardConf.coins);
                roleObj.golds += parseInt(rewardConf.golds);
                roleObj.contribs += parseInt(rewardConf.contribs);
                roleObj.energy += parseInt(rewardConf.energy);
                roleObj.dailyRefreshData.dailyReward = true;

                return [roleObj, roleObj.saveP(), session.push("role")];
            })
            .spread((roleObj) => {
                var rewardDict = {
                    energy: roleObj.energy,
                    coins: roleObj.coins,
                    golds: roleObj.golds,
                    contribs: roleObj.contribs,

                    energyDiff: parseInt(rewardConf.energy),
                    coinsDiff: parseInt(rewardConf.coins),
                    goldsDiff: parseInt(rewardConf.golds),
                    contribsDiff: parseInt(rewardConf.contribs)
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
        var rewardConf = this.app.get("dataService").get("reward").data.qhourly;
        if ((role.dailyRefreshData.qhourlyReward || 0) < parseInt(rewardConf.extra)) {
            role.dailyRefreshData.qhourlyReward = (role.dailyRefreshData.qhourlyReward || 0) + 1;

            this.safe(models.Role.findP(role.id).bind(this)
            .then((roleObj) => {
                roleObj.coins += parseInt(rewardConf.coins);
                roleObj.golds += parseInt(rewardConf.golds);
                roleObj.contribs += parseInt(rewardConf.contribs);
                roleObj.energy += parseInt(rewardConf.energy);
                roleObj.dailyRefreshData.qhourlyReward = (roleObj.dailyRefreshData.qhourlyReward || 0) + 1;

                return [roleObj, roleObj.saveP(), session.push("role")];
            })
            .spread((roleObj) => {
                var rewardDict = {
                    energy: roleObj.energy,
                    coins: roleObj.coins,
                    golds: roleObj.golds,
                    contribs: roleObj.contribs,

                    energyDiff: parseInt(rewardConf.energy),
                    coinsDiff: parseInt(rewardConf.coins),
                    goldsDiff: parseInt(rewardConf.golds),
                    contribsDiff: parseInt(rewardConf.contribs)
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

        this.safe(models.findP(role.id).bind(this)
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
            return [roleObj.saveP(), session.push("role")];
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
