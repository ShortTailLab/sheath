require("traceur");
var pomelo = require('pomelo');
var dataPlugin = require('pomelo-data-plugin');
var appModels = require("../shared/models");
var logger = require('pomelo-logger').getLogger('sheath', __filename);
var Constants = require("../shared/constants");
var authFilter = require("./app/filters/authFilter");
var Patcher = require("./app/utils/monkeyPatch");

/**
 * Init app for client.
 */
var app = pomelo.createApp();
app.set('name', 'sheath');
app.loadConfig("rethinkdb", app.getBase() + "/config/rethinkdb.json");
app.enable('systemMonitor');
app.before(pomelo.filters.toobusy(80));

// app configuration
app.configure("development|production", 'connector', function () {
    app.set('connectorConfig',
        {
            connector: pomelo.connectors.hybridconnector,
            heartbeat: 5,
            useDict: true,
            useProtobuf: true
        });
});

app.configure("development|production", 'auth|connector|game|manager', function () {
    Patcher.wrapModel();

    var rethinkConfig = app.get("rethinkdb");
    appModels.init({
        host: rethinkConfig.host,
        port: rethinkConfig.port,
        database: rethinkConfig.database,
        poolMin: 10,
        poolMax: 100
    }).connect();
});

app.configure('development', function () {
    app.filter(pomelo.filters.time());
});

app.configure(function () {
    app.before(new authFilter("connector.entryHandler.enter", "connector.entryHandler.enterPartition"));
    app.registerAdmin(require('./app/modules/onlineUser'), {app: app});

    app.use(dataPlugin, {
        watcher: {
            dir: __dirname + "/config/data",
            idx: "id",
            interval: 5000
        }
    });
});

function patchRPC(app) {
    process.nextTick(function () {
        if (app.rpc)
            Patcher.patchRPC(app);
        else
            patchRPC(app);
    });
}

app.event.on(pomelo.events.ADD_SERVERS, function () {
    if (["connector", "auth", "game"].indexOf(app.settings.serverType) !== -1) {
        patchRPC(app);
    }
});

var errorHandler = function (err, msg, resp, session, cb) {
    if (err.__sheath__error__) {
        cb(null, {error: {code: err.code}});
    }
    else if (err.code === 500 && err.message === "Server toobusy!") {
        cb(null, {error: {code: Constants.TIME_OUT, message: "Server too busy"}});
    }
    else {
        cb(null, {error: {code: Constants.InternalServerError, message: "Internal Server Error"}});
        logger.debug('exception. ' + err.stack);
    }
};

app.set("globalErrorHandler", errorHandler);
app.set("errorHandler", errorHandler);

// start app
app.start();

process.on('uncaughtException', function (err) {
    console.error(' Caught exception: ' + err.stack);
});
