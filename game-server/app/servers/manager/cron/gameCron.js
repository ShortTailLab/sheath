var models = require("../../../../../shared/models");
var r = require("rethinkdb");
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
        models.Role.update({update: {"dailyRefreshData": r.literal({})}}).run()
        .catch(function (err) {
            logger.logError("cron.dailyRefresh", {
                message: ""+err
            });
        });
    }
}
