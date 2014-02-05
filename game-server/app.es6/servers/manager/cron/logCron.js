var models = require("../../../../../shared/models");
var r = require("rethinkdb");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);
var moment = require("moment");
var Promise = require("bluebird");
var jobs = require("./logJobs");
var logger;

module.exports = function (app) {
    return new LogCron(app);
};

class LogCron {
    constructor(app) {
        this.app = app;
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
            var curHour = moment().minutes(0).seconds(0);
            var prevHour = curHour.subtract(1, 'h');
            curHour = curHour.toDate();
            prevHour = prevHour.toDate();

            cb();
        });
    }

    dailyLogRollUp() {
        this.getConn((db, conn, cb) => {
            var curHour = moment().minutes(0).seconds(0);
            var prevDay = curHour.subtract(1, 'd');
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
