var models = require("../../../shared/models");
var r = require("rethinkdb");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);

var _app;


var logger = {};
var logModel = new models.Log();

logger.log = function (severity, msg) {
    var entry = {
        severity: severity,
        time: new Date(),
        server: _app.getServerId(),
        msg: msg
    };
    try {
        var adapter = logModel._adapter();
        adapter.pool.acquire(function(error, client) {
            r.table("log").insert(entry).run({connection: client, noreply: true}, function(err) {
                if (err) pLogger.warn("error writing log to database." + err);
                adapter.pool.release(client);
            });
        });
    }
    catch (err) {
        pLogger.warn("error writing log to database." + err);
    }
};

logger.logInfo = function (msg) {
    logger.log("INFO", msg);
};

logger.logDebug = function (msg) {
    logger.log("DEBUG", msg);
};

logger.logError = function (msg) {
    logger.log("ERROR", msg);
};


function getLogger(app) {
    _app = app;
    return logger;
}


module.exports.getLogger = getLogger;
