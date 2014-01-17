var models = require("../../../shared/models");
var r = require("rethinkdb");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);

var _app;


var logger = {};
var logModel = null;

logger.log = function (severity, type, msg) {
    if (logModel === null) {
        logModel = new models.Log();
    }

    var entry = {
        severity: severity,
        time: new Date(),
        server: _app.getServerId(),
        type: type,
        msg: msg
    };
    try {
        var adapter = logModel._adapter();
        adapter.pool.acquire(function(error, client) {
            r.db(adapter.database).table("log").insert(entry).run({connection: client, noreply: true, durability: "soft"}, function(err) {
                if (err) pLogger.warn("error writing log to database." + err);
                adapter.pool.release(client);
            });
        });
    }
    catch (err) {
        pLogger.warn("error writing log to database." + err);
    }
};

logger.logInfo = function (type, msg) {
    logger.log("INFO", type, msg);
};

logger.logDebug = function (type, msg) {
    logger.log("DEBUG", type, msg);
};

logger.logError = function (type, msg) {
    logger.log("ERROR", type, msg);
};


function getLogger(app) {
    _app = app;
    return logger;
}


module.exports.getLogger = getLogger;
