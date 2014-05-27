var models = require("../../../../../shared/models");
var r = models.r;
var moment = require("moment");
var Promise = require("bluebird");

exports.dailyNewUser = function (start, end) {
    return models.Log.between(["user.register", start], ["user.register", end], {index: "type_time"}).count().execute()
    .then(function (regCount) {
        return models.Stat.insert({
            id: "dnu-" + (+start / 100000),
            cycle: "daily",
            type: "newUser",
            time: start,
            value: regCount
        }, {upsert: true}).execute();
    });
};

exports.dailyNewRole = function (start, end) {
    return models.Log.between(["role.register", start], ["role.register", end], {index: "type_time"}).count().execute()
    .then(function (regCount) {
        return models.Stat.insert({
            id: "dnr-" + (+start / 100000),
            cycle: "daily",
            type: "newRole",
            time: start,
            value: regCount
        }, {upsert: true}).execute();
    });
};

exports.dailyActiveUser = function (start, end) {
    return models.Log.between(["user.login", start], ["user.login", end], {index: "type_time"}).group(r.row("msg")("user")).count().ungroup().count().execute()
    .then(function (activeCount) {
        return models.Stat.insert({
            id: "dau-" + (+start / 100000),
            cycle: "daily",
            type: "activeUser",
            time: start,
            value: activeCount
        }, {upsert: true}).execute();
    });
};

exports.dailyActiveRole = function (start, end) {
    return models.Log.between(["role.login", start], ["role.login", end], {index: "type_time"}).group(r.row("msg")("role")("id")).count().ungroup().count().execute()
    .then(function (activeCount) {
        return models.Stat.insert({
            id: "dar-" + (+start / 100000),
            cycle: "daily",
            type: "activeRole",
            time: start,
            value: activeCount
        }, {upsert: true}).execute();
    });
};

function retentionOfDays(start, end, days) {
    var regStart = moment(start).subtract(days, "d");
    var regEnd = moment(regStart).add(1, "d");

    var loginLogs = models.Log.between(["user.login", start], ["user.login", end], {index: "type_time"}).group(r.row("msg")("user")).count().ungroup();
    var regLogs = models.Log.between(["user.register", regStart.toDate()], ["user.register", regEnd.toDate()], {index: "type_time"});
    var regCount = regLogs.count();

    var recurLogins = regLogs.innerJoin(loginLogs._query, function (reg, login) {
        return reg("msg")("user").eq(login("group"));
    }).count();

    return Promise.join(recurLogins.execute(), regCount.execute())
    .spread(function (logins, regs) {
        return models.Stat.insert({
            id: ["dre", days, +start / 100000].join("-"),
            cycle: "daily",
            type: "retention.d" + days,
            time: start,
            value: regs ? logins/regs : 0
        }, {upsert: true}).execute();
    });
}

exports.dailyRetention = function (start, end) {
    return Promise.join(
        retentionOfDays(start, end, 1),
        retentionOfDays(start, end, 3),
        retentionOfDays(start, end, 7),
        retentionOfDays(start, end, 14),
        retentionOfDays(start, end, 30)
    );
};
