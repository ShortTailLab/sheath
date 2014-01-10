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
    }

    changeName(msg, session, next) {
        wrapSession(session);

        var newName = msg.newName;
        var role = session.get("role");
        if (!newName || role.name === newName) {
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
