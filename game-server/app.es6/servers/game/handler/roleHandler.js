var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var logger;


module.exports = function (app) {
    return new RoleHandler(app);
};

class RoleHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
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
            Promise.all(models.User.updateAttributeP("name", newName), session.push("role")).then(() => {
                next(null, {
                });
            })
            .catch((err) => {
                this.errorNext(err, next);
            });
        }
    }

    setTeam(msg, session, next) {
        wrapSession(session);

        if (msg.heroes.length !== 3 || !msg.heroes[0]) {
            this.errorNext(Constants.InvalidRequest, next);
        }
        else {
            for (let i=0;i<3;i++) {
                msg.heroes[i] = msg.heroes[i] || null;
            }

            var role;
            models.Role.findP(session.get("role").id)
            .then((r) => {
                role = r;
                return models.Hero.allP({where: {owner: role.id}});
            })
            .then((heroes) => {
                const heroIds = _.pluck(heroes, "id");
                for (let hid of msg.heroes) {
                    if (hid !== null && !_.contains(heroIds, hid)) {
                        return Promise.reject(Constants.InvalidRequest);
                    }
                }

                role.team = msg.heroes;
                return [role.updateAttributeP("team", msg.heroes), session.push("role")];
            })
            .all().then(() => {
                next(null, {
                    role: role.toClientObj()
                });
            })
            .catch((err) => {
                this.errorNext(err, next);
            });
        }
    }

    claimDailyReward(msg, session, next) {
        wrapSession(session);

        var role = session.get("role");
        if (!role.dailyRefreshData.dailyReward) {
            role.dailyRefreshData.dailyReward = true;
            var rewardConf = this.app.get("dataService").get("reward").data.daily;

            models.Role.findP(role.id)
            .then((roleObj) => {
                roleObj.coins += parseInt(rewardConf.coins);
                roleObj.golds += parseInt(rewardConf.golds);
                roleObj.contribs += parseInt(rewardConf.contribs);
                roleObj.energy += parseInt(rewardConf.energy);
                roleObj.dailyRefreshData.dailyReward = true;

                return [roleObj, roleObj.saveP(), session.push("role")];
            })
            .all().spread((roleObj) => {
                next(null, {
                    reward: {
                        energy: roleObj.energy,
                        coins: roleObj.coins,
                        golds: roleObj.golds,
                        contribs: roleObj.contribs,

                        energyDiff: parseInt(rewardConf.energy),
                        coinsDiff: parseInt(rewardConf.coins),
                        goldsDiff: parseInt(rewardConf.golds),
                        contribsDiff: parseInt(rewardConf.contribs)
                    }
                });
            })
            .catch((err) => {
                this.errorNext(err, next);
            });
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

            models.Role.findP(role.id)
            .then((roleObj) => {
                roleObj.coins += parseInt(rewardConf.coins);
                roleObj.golds += parseInt(rewardConf.golds);
                roleObj.contribs += parseInt(rewardConf.contribs);
                roleObj.energy += parseInt(rewardConf.energy);
                roleObj.dailyRefreshData.qhourlyReward = (roleObj.dailyRefreshData.qhourlyReward || 0) + 1;

                return [roleObj, roleObj.saveP(), session.push("role")];
            })
            .all().spread((roleObj) => {
                next(null, {
                    reward: {
                        energy: roleObj.energy,
                        coins: roleObj.coins,
                        golds: roleObj.golds,
                        contribs: roleObj.contribs,

                        energyDiff: parseInt(rewardConf.energy),
                        coinsDiff: parseInt(rewardConf.coins),
                        goldsDiff: parseInt(rewardConf.golds),
                        contribsDiff: parseInt(rewardConf.contribs)
                    }
                });
            })
            .catch((err) => {
                this.errorNext(err, next);
            });
        }
        else {
            this.errorNext(Constants.ALREADY_CLAIMED, next);
        }
    }
}
