var models = require("../../../shared/models");
var pLogger = require('pomelo-logger').getLogger('sheath', __filename);

var _app;

var logger = {};

logger.log = function (severity, type, msg) {
    var entry = {
        severity: severity,
        time: new Date(),
        server: _app.getServerId(),
        type: type,
        msg: msg
    };

    models.Log.insert(entry).execute({noreply: true, durability: "soft"})
    .catch(function (err) {
        pLogger.warn("error writing log to database." + err);
    });
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

logger.print = function(msg) {
    pLogger.error(msg);
};

function getLogger(app) {
    _app = app;
    return logger;
}

module.exports.getLogger = getLogger;
