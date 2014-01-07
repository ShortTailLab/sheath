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

        var role = new models.Role(session.get("role"));
        if (!role.dailyRefreshData.dailyReward) {
            role.dailyRefreshData.dailyReward = true;
            var rewardConf = this.app.get("dataService").get("reward");
            console.log(rewardConf);

            session.set("role", role.toObject(true));
            Promise.all(role.saveP(), session.push("role")).then(() => {
                next(null, {
                });
            });
        }
        else {
            this.errorNext(Constants.ALREADY_CLAIMED, next);
        }
    }

    claimQuarterHourlyReward(msg, session, next) {
        wrapSession(session);
    }
}
