var models = require("../../../../../shared/models");
var r = models.r;
var moment = require("moment");
var Promise = require("bluebird");

exports.dailyNewUser = function (start, end) {
    return models.Log.between(["user.register", start], ["user.register", end], {index: "type_time"}).count().execute()
    .then(function (regCount) {
        return new models.Stat({
            cycle: "daily",
            type: "newUser",
            time: start,
            value: regCount
        }).save();
    });
};

exports.dailyActiveUser = function (start, end) {
    return models.Log.between(["user.login", start], ["user.login", end], {index: "type_time"}).group(r.row("msg")("user")).count().execute()
    .then(function (err, activeCount) {
        return new models.Stat({
            cycle: "daily",
            type: "activeUser",
            time: start,
            value: activeCount
        }).save();
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

    return Promise.join(recurLogins, regCount)
    .spread(function (logins, regs) {
        return new models.Stat({
            cycle: "daily",
            type: "retention.d" + days,
            time: start,
            value: logins/regs
        }).save();
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
