var models = require("../../../../../shared/models");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);
var moment = require("moment");
var Promise = require("bluebird");
var jobs = require("./logJobs");
var opJobs = require("./ourpalmJobs");
var mkdirp = require("mkdirp");
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
        var rawPath = app.get("opLog").path;
        this.path = rawPath.startsWith("/") ? rawPath : (app.getBase() + "/" + rawPath);
        mkdirp.sync(this.path);
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    hourlyLogRollUp() {
        var curHour = moment().startOf("hour");
        var prevHour = moment(curHour).subtract(1, 'h');

        opJobs.rollUp(this.path, prevHour, curHour);
    }

    dailyLogRollUp() {
        var curHour = moment().startOf("hour");
        var prevDay = moment(curHour).subtract(1, 'd');
        curHour = curHour.toDate();
        prevDay = prevDay.toDate();

        this.runJobs(prevDay, curHour);
    }

    weeklyLogRollUp() {
    }

    monthlyLogRollUp() {
    }
}
