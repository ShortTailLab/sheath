var models = require("../../../../../shared/models");
var r = require("rethinkdb");
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

class LogCron {
    constructor(app) {
        this.app = app;
        var rawPath = app.get("opLog").path;
        this.path = rawPath.startsWith("/") ? rawPath : (app.getBase() + "/" + rawPath);
        mkdirp.sync(this.path);
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    hourlyLogRollUp() {
        var curHour = moment().minutes(0).seconds(0).milliseconds(0);
        var prevHour = moment(curHour).subtract(1, 'h');

        opJobs.rollUp(this.path, prevHour, curHour);
    }

    dailyLogRollUp() {
        var curHour = moment().minutes(0).seconds(0).milliseconds(0);
        var prevDay = moment(curHour).subtract(1, 'd');
        curHour = curHour.toDate();
        prevDay = prevDay.toDate();

        Promise.join(
            jobs.dailyNewUser(prevDay, curHour),
            jobs.dailyActiveUser(prevDay, curHour),
            jobs.dailyRetention(prevDay, curHour)
        );
    }

    weeklyLogRollUp() {
    }

    monthlyLogRollUp() {
    }
}
