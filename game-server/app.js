require("traceur");
var pomelo = require('pomelo');
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

app.configure("development|production", 'auth|connector', function () {
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
    app.before(new authFilter("connector.entryHandler.enter"));
    app.registerAdmin(require('./app/modules/onlineUser'), {app: app});
});

app.event.on(pomelo.events.ADD_SERVERS, function () {
    if (["connector", "auth"].indexOf(app.settings.serverType) !== -1) {
        process.nextTick(function () {
            Patcher.patchRPC(app);
        });
    }
});

app.set("globalErrorHandler", function (err, msg, resp, session, cb) {
    if (err.__sheath__error__) {
        cb(null, {error: {code: err.code}});
    }
    else if (err.code === 500 && err.message === "Server toobusy!") {
        cb(null, {error: {code: Constants.TimeOut, message: "Server too busy"}});
    }
    else {
        cb(null, {error: {code: Constants.InternalServerError, message: "Internal Server Error"}});
        logger.debug('exception. ' + err.stack);
    }
});

// start app
app.start();

process.on('uncaughtException', function (err) {
    console.error(' Caught exception: ' + err.stack);
});
