var models = require("../../../../../shared/models");
var r = require("rethinkdb");
var moment = require("moment");
var Promise = require("bluebird");

exports.dailyNewUser = function (conn, db, start, end) {
    return new Promise(function (resolve) {
        var log = db.table("log");
        var timeSlicedLogs = log.between(["user.register", start], ["user.register", end], {index: "type_time"});

        timeSlicedLogs.count().run(conn, function (err, regCount) {
            if (!err) {
                var stat = new models.Stat();
                stat.cycle = "daily";
                stat.type = "newUser";
                stat.time = start;
                stat.value = regCount;

                resolve(stat.saveP());
            }
        });
    });
};

exports.dailyActiveUser = function (conn, db, start, end) {
    return new Promise(function (resolve) {
        var log = db.table("log");
        var timeSlicedLogs = log.between(["user.login", start], ["user.login", end], {index: "type_time"});

        timeSlicedLogs.groupedMapReduce(
            r.row("msg")("user"),
            function () { return 1; },
            function () { return 1; }
        ).count().run(conn, function (err, activeCount) {
            if (!err) {
                var stat = new models.Stat();
                stat.cycle = "daily";
                stat.type = "activeUser";
                stat.time = start;
                stat.value = activeCount;

                resolve(stat.saveP());
            }
        });
    });
};

function retentionOfDays(conn, db, start, end, days) {
    return new Promise(function (resolve) {
        var log = db.table("log");
        var regStart = moment(start).subtract(days, "d");
        var regEnd = regStart.add(1, "d");

        var loginLogs = log.between(["user.login", start], ["user.login", end], {index: "type_time"}).groupBy({msg: "user"}, r.count);
        var regLogs = log.between(["user.register", regStart.toDate()], ["user.register", regEnd.toDate()], {index: "type_time"});

        regLogs.innerJoin(loginLogs, function (reg, login) {
            return reg("msg")("user").eq(login("group")("msg")("user"));
        }).count().run(conn, function (err, retentionCount) {
            if (!err) {
                var stat = new models.Stat();
                stat.cycle = "daily";
                stat.type = "retention.d" + days;
                stat.time = start;
                stat.value = retentionCount;

                resolve(stat.saveP());
            }
        });
    });
}

exports.dailyRetention = function (conn, db, start, end) {
    return Promise.join(
        retentionOfDays(conn, db, start, end, 1),
        retentionOfDays(conn, db, start, end, 3),
        retentionOfDays(conn, db, start, end, 7),
        retentionOfDays(conn, db, start, end, 30)
    );
};
