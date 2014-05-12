var models = require("../../../../../shared/models");
var r = require("rethinkdb");
var moment = require("moment");
var Promise = require("bluebird");

exports.dailyNewUser = function (start, end) {
    return models.Log.between(["user.register", start], ["user.register", end], {index: "type_time"}).count().execute()
    .then(function (regCount) {
        var stat = new models.Stat();
        stat.cycle = "daily";
        stat.type = "newUser";
        stat.time = start;
        stat.value = regCount;

        return stat.save();
    });
};

exports.dailyActiveUser = function (start, end) {
    return models.Log.between(["user.login", start], ["user.login", end], {index: "type_time"}).group(r.row("msg")("user")).count().execute()
    .then(function (err, activeCount) {
        var stat = new models.Stat();
        stat.cycle = "daily";
        stat.type = "activeUser";
        stat.time = start;
        stat.value = activeCount;

        return stat.save();
    });
};

function retentionOfDays(start, end, days) {
    var regStart = moment(start).subtract(days, "d");
    var regEnd = regStart.add(1, "d");

    var loginLogs = models.Log.between(["user.login", start], ["user.login", end], {index: "type_time"}).group(function (row) {return [row("msg")("user"), row("time").date()];}).count().ungroup()
    var regLogs = models.Log.between(["user.register", regStart.toDate()], ["user.register", regEnd.toDate()], {index: "type_time"});

    return regLogs.innerJoin(loginLogs, function (reg, login) {
        return reg("msg")("user").eq(login("group").nth(0));
    }).count().run()
    .then(function (retentionCount) {
        if (retentionCount.length === 0) return;
        var stat = new models.Stat();
        stat.cycle = "daily";
        stat.type = "retention.d" + days;
        stat.time = start;
        stat.value = retentionCount[0].reduction;

        return stat.save();
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
