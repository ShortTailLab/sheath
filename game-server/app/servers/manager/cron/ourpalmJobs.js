var models = require("../../../../../shared/models");
var zlib = require("zlib");
var stream = require("stream");
var fs = require("fs");
var util = require("util");
var moment = require("moment");
var Promise = require("bluebird");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);

exports.rollUp = function (logPath, startTime, endTime) {
    pLogger.info("Begin processing ourpalm log from " + startTime.format("lll") + " to " + endTime.format("lll"));
    return Promise.join(
        rollUpUserLogin(logPath, startTime, endTime),
        rollUpUserCreate(logPath, startTime, endTime),
        rollUpRoleLogin(logPath, startTime, endTime),
        rollUpRoleCreate(logPath, startTime, endTime)
//        rollUpGameLaunch(logPath, startTime, endTime),
//        rollUpPurchase(logPath, startTime, endTime),
//        rollUpSpent(logPath, startTime, endTime),
//        rollUpPropUpdate(logPath, startTime, endTime),
//        rollUpHeartBeat(logPath, startTime, endTime)
    )
    .then(function () {
        pLogger.info("Ourpalm log processing done");
    })
    .catch(function (err) {
        pLogger.warn("Error processing ourpalm log. " + err);
    });
};

var longDistroID = function (log) {
    return log.msg.distro;
};

var accountNameAndSrc = function (log) {
    var dName = log.msg.accType === "main" ? "stl" : log.msg.distro;
    return [log.msg.accId + "@" + dName + ".com", dName];
};

var fileNameForLog = function (logPath, type, time) {
    return util.format("%s/z0.dagger.shorttaillab.hgame.%s.%s.gz", logPath, type, time.format("YYYY-MM-DD-HH"));
};

var gzipStream = function (logPath, type, time) {
    var s = new stream.PassThrough();
    s.pipe(zlib.createGzip()).pipe(fs.createWriteStream(fileNameForLog(logPath, type, time)));
    return s;
};

var writeLogLine = function (s, time, args) {
    var timeStr = moment(time).format("YYYY-MM-DD HH:mm:ss");
    args.unshift(timeStr);
    var line = args.join("|") + "\n";
    s.write(line);
};

var rollUpUserLogin = function (logPath, startTime, endTime) {
    var gz = null;
    var logType = "user.login";
    return models.Log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"}).run()
    .then(function (logs) {
        gz = gzipStream(logPath, "account-login", startTime);
        for (var i=0;i<logs.length;i++) {
            var l = logs[i];
            var device = l.msg.device;
            var acc, accSrc;
            [acc, accSrc] = accountNameAndSrc(l);

            writeLogLine(gz, l.time, [longDistroID(l), l.server, "1.0", device.os, device.osVersion, device.res.width+"*"+device.res.height,
                "null", "null", device.mac, device.device, l.msg.clientVer||"1.0", l.msg.ip, acc, accSrc, l.msg.user
            ]);
        }
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpUserCreate = function (logPath, startTime, endTime) {
    var gz = null;
    var logType = "user.register";
    return models.Log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"}).run()
    .then(function (logs) {
        gz = gzipStream(logPath, "account-register", startTime);
        for (var i=0;i<logs.length;i++) {
            var l = logs[i];
            var device = l.msg.device;
            var acc, accSrc;
            [acc, accSrc] = accountNameAndSrc(l);

            writeLogLine(gz, l.time, [longDistroID(l), l.server, "1.0", device.os, device.osVersion, device.res.width+"*"+device.res.height,
                "null", "null", device.mac, device.device, l.msg.clientVer||"1.0", l.msg.ip, acc, accSrc, l.msg.user, "null", "null"
            ]);
        }
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpRoleLogin = function (logPath, startTime, endTime) {
    var gz = null;
    var logType = "role.login";
    return models.Log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"}).run()
    .then(function (logs) {
        gz = gzipStream(logPath, "role-login", startTime);
        for (var i=0;i<logs.length;i++) {
            var l = logs[i];

            writeLogLine(gz, l.time, [longDistroID(l), l.server, l.server, "1.0", "null", "null", "null", "null",
                l.msg.user, l.msg.role.id, l.msg.role.level, l.msg.role.vip, 0, 0
            ]);
        }
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpRoleCreate = function (logPath, startTime, endTime) {
    var gz = null;
    var logType = "role.register";
    return models.Log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"}).run()
    .then(function (logs) {
        gz = gzipStream(logPath, "role-register", startTime);
        for (var i=0;i<logs.length;i++) {
            var l = logs[i];

            writeLogLine(gz, l.time, [longDistroID(l), l.server, l.server, "1.0", "null", "null", "null", "null",
                l.msg.user, l.msg.role.id, l.msg.role.level, l.msg.role.vip, 0, 0, "null", l.msg.role.name
            ]);
        }
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpGameLaunch = function (logPath, startTime, endTime) {
    var gz = null;
    var logType = "launch";
    return models.Log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"}).run()
    .then(function (logs) {
        gz = gzipStream(logPath, "launch", startTime);
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpPurchase = function (logPath, startTime, endTime) {
};

var rollUpSpent = function (logPath, startTime, endTime) {
};

var rollUpPropUpdate = function (logPath, startTime, endTime) {
};

var rollUpHeartBeat = function (logPath, startTime, endTime) {
};
