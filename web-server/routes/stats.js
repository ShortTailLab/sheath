var _ = require("lodash");
var Promise = require("bluebird");
var appModels = require("../../shared/models");
var r = appModels.r;
var moment = require("moment");

function transform(results) {
    return _.map(results, function (row) {
        return {
            x: row.group.toISOString(),
            y: row.reduction
        };
    });
}

exports.retention = function(type, startTime, endTime, cycle) {
    var regType = "user.register";
    var loginType = "user.login";

    var loginSTime = moment(startTime);
    var loginETime = moment(endTime);
    var regSTime = moment(loginSTime).subtract(cycle, "d");
    var regETime = moment(loginETime).subtract(cycle, "d");

    var loginStream = appModels.Log.between([loginType, loginSTime.toDate()], [loginType, loginETime.toDate()], {index: "type_time"})
        .group(function (row) {return [row("msg")("user"), row("time").inTimezone("+08:00").date()];}).count().ungroup();
    var regStream = appModels.Log.between([regType, regSTime.toDate()], [regType, regETime.toDate()], {index: "type_time"});

    var day = 24 * 60 * 60;

    var recurLogins =  regStream.innerJoin(loginStream._query, function (reg, login) {
        return reg("msg")("user").eq(login("group").nth(0))
            .and(reg("time").inTimezone("+08:00").date().toEpochTime().add(day * cycle).eq(login("group").nth(1).toEpochTime()));
    }).group(r.row("left")("time").inTimezone("+08:00").date()).count().ungroup();

    var regCount = regStream.group(r.row("time").inTimezone("+08:00").date()).count().ungroup();

    return recurLogins.innerJoin(regCount._query, function (recurs, regs) {
        return recurs("group").eq(regs("group"));
    })
    .execute()
    .then(function (cursor) {
        return cursor.toArray();
    })
    .then(function (retentions) {
        return _.map(retentions, function (row) {
            return {
                x: moment(row.left.group).add(cycle, "d").toISOString(),
                y: row.left.reduction / row.right.reduction,
                logins: row.left.reduction,
                regs: row.right.reduction
            };
        });
    });
};

exports.newRegRole = function (type, startTime, endTime, cycle) {
    var logType = "role.register";
    return appModels.Log.between([logType, startTime], [logType, endTime], {index: "type_time"})
        .group(r.row("time").inTimezone("+08:00").date()).count().execute()
        .then(transform);
};

exports.newRegUser = function (type, startTime, endTime, cycle) {
    var logType = "user.register";
    return appModels.Log.between([logType, startTime], [logType, endTime], {index: "type_time"})
        .group(r.row("time").inTimezone("+08:00").date()).count().execute()
        .then(transform);
};

exports.onlineRole = function (type, startTime, endTime, cycle) {
    var logType = "role.login";
    return appModels.Log.between([logType, startTime], [logType, endTime], {index: "type_time"})
        .group(function (row) {return [row("msg")("role")("id"), row("time").inTimezone("+08:00").date()];}).count()
        .ungroup().group(r.row("group").nth(1)).count()
        .execute()
        .then(transform);
};

exports.onlineUser = function (type, startTime, endTime, cycle) {
    var logType = "user.login";
    return appModels.Log.between([logType, startTime], [logType, endTime], {index: "type_time"})
        .group(function (row) {return [row("msg")("user"), row("time").inTimezone("+08:00").date()];}).count()
        .ungroup().group(r.row("group").nth(1)).count()
        .execute()
        .then(transform);
};
