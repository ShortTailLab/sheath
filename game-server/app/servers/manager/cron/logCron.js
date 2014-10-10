var models = require("../../../../../shared/models");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);
var moment = require("moment");
var Promise = require("bluebird");
var jobs = require("./logJobs");
var logger;

module.exports = function (app) {
    return new LogCron(app);
};

module.exports.runJobs = function(start, end) {
    return Promise.join(
        jobs.dailyNewUser(start, end),
        jobs.dailyNewRole(start, end),
        jobs.dailyActiveUser(start, end),
        jobs.dailyActiveRole(start, end),
        jobs.dailyRetention(start, end)
    );
};

class LogCron {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    dailyLogRollUp() {
        var curHour = moment().startOf("hour");
        var prevDay = moment(curHour).subtract(1, 'd');
        curHour = curHour.toDate();
        prevDay = prevDay.toDate();

        module.exports.runJobs(prevDay, curHour);
    }

    weeklyLogRollUp() {
    }

    monthlyLogRollUp() {
    }
}
