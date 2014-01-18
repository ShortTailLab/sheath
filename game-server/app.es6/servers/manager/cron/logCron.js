var models = require("../../../../../shared/models");
var r = require("rethinkdb");
var logger;

module.exports = function (app) {
    return new LogCron(app);
};

class LogCron {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    hourlyLogRollUp() {
    }

    weeklyLogRollUp() {
    }

    monthlyLogRollUp() {
    }
}
