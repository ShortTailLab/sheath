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

    getConn(cb) {
        var adapter = new models.Log()._adapter();
        var self = this;
        adapter.pool.acquire(function(error, client) {
            if (error) {
                pLogger.warn("error acquiring connection: " + error);
                adapter.pool.release(client);
            }
            else {
                cb.bind(self);
                cb(r.db(adapter.database), client, function () {
                    adapter.pool.release(client);
                });
            }
        });
    }

    hourlyLogRollUp() {
        this.getConn((db, conn, cb) => {
            var curHour = moment().minutes(0).seconds(0).milliseconds(0);
            var prevHour = moment(curHour).subtract(1, 'h');

            opJobs.rollUp(this.path, conn, db, prevHour, curHour).then(cb);
        });
    }

    dailyLogRollUp() {
        this.getConn((db, conn, cb) => {
            var curHour = moment().minutes(0).seconds(0).milliseconds(0);
            var prevDay = moment(curHour).subtract(1, 'd');
            curHour = curHour.toDate();
            prevDay = prevDay.toDate();

            Promise.join(
                jobs.dailyNewUser(conn, db, prevDay, curHour),
                jobs.dailyActiveUser(conn, db, prevDay, curHour),
                jobs.dailyRetention(conn, db, prevDay, curHour)
            ).then(cb);
        });
    }

    weeklyLogRollUp() {
        this.getConn((db, conn, cb) => {
            var log = db.table("log");
            cb();
        });
    }

    monthlyLogRollUp() {
        this.getConn((db, conn, cb) => {
            var log = db.table("log");
            cb();
        });
    }
}
