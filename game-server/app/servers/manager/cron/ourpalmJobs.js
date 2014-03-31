var models = require("../../../../../shared/models");
var zlib = require("zlib");
var stream = require("stream");
var fs = require("fs");
var util = require("util");
var r = require("rethinkdb");
var moment = require("moment");
var Promise = require("bluebird");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);

var runQuery = function (query, conn, resolve, reject) {
    query.run(conn, function (err, cursor) {
        if (err) reject(err);
        else {
            cursor.toArray(function (err, results) {
                if (err) reject(err);
                else resolve(results);
            });
        }
    });
};

exports.rollUp = function (logPath, conn, db, startTime, endTime) {
    pLogger.info("Begin processing ourpalm log from " + startTime.format("lll") + " to " + endTime.format("lll"));
    return Promise.join(
        rollUpUserLogin(logPath, conn, db, startTime, endTime),
        rollUpUserCreate(logPath, conn, db, startTime, endTime)
//        rollUpRoleLogin(logPath, conn, db, startTime, endTime),
//        rollUpRoleCreate(logPath, conn, db, startTime, endTime),
//        rollUpGameLaunch(logPath, conn, db, startTime, endTime),
//        rollUpPurchase(logPath, conn, db, startTime, endTime),
//        rollUpSpent(logPath, conn, db, startTime, endTime),
//        rollUpPropUpdate(logPath, conn, db, startTime, endTime),
//        rollUpHeartBeat(logPath, conn, db, startTime, endTime)
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
    var dName = log.msg.distro === "main" ? "stl" : log.msg.distro;
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

var rollUpUserLogin = function (logPath, conn, db, startTime, endTime) {
    var gz = null;
    return new Promise(function (resolve, reject) {
        var log = db.table("log");
        var logType = "user.login";
        var timeSlicedLogs = log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"});
        runQuery(timeSlicedLogs, conn, resolve, reject);
    })
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

var rollUpUserCreate = function (logPath, conn, db, startTime, endTime) {
    var gz = null;
    return new Promise(function (resolve, reject) {
        var log = db.table("log");
        var logType = "user.register";
        var timeSlicedLogs = log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"});
        runQuery(timeSlicedLogs, conn, resolve, reject);
    })
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

var rollUpRoleLogin = function (logPath, conn, db, startTime, endTime) {
    var gz = null;
    return new Promise(function (resolve, reject) {
        var log = db.table("log");
        var logType = "role.login";
        var timeSlicedLogs = log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"});
        runQuery(timeSlicedLogs, conn, resolve, reject);
    })
    .then(function (logs) {
        gz = gzipStream(logPath, "role-login", startTime);
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpRoleCreate = function (logPath, conn, db, startTime, endTime) {
    var gz = null;
    return new Promise(function (resolve, reject) {
        var log = db.table("log");
        var logType = "role.register";
        var timeSlicedLogs = log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"});
        runQuery(timeSlicedLogs, conn, resolve, reject);
    })
    .then(function (logs) {
        gz = gzipStream(logPath, "role-register", startTime);
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpGameLaunch = function (logPath, conn, db, startTime, endTime) {
    var gz = null;
    return new Promise(function (resolve, reject) {
        var log = db.table("log");
        var logType = "launch";
        var timeSlicedLogs = log.between([logType, startTime.toDate()], [logType, endTime.toDate()], {index: "type_time"});
        runQuery(timeSlicedLogs, conn, resolve, reject);
    })
    .then(function (logs) {
        gz = gzipStream(logPath, "launch", startTime);
    })
    .finally(function () {
        if (gz !== null) {
            gz.end();
        }
    });
};

var rollUpPurchase = function (logPath, conn, db, startTime, endTime) {
};

var rollUpSpent = function (logPath, conn, db, startTime, endTime) {
};

var rollUpPropUpdate = function (logPath, conn, db, startTime, endTime) {
};

var rollUpHeartBeat = function (logPath, conn, db, startTime, endTime) {
};
