var models = require("../../../../../shared/models");
var logger;

module.exports = function (app) {
    return new GameCron(app);
};

class GameCron {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    dailyRefresh() {
        models.Role.updateAttribute("dailyRefreshData", {}, function (err) {
            if (err) {
                logger.logError("cron.dailyRefresh", {
                    message: ""+err
                });
            }
        });
    }
}
