//var profiler = require("nodetime");
require("../shared/traceurBootstrap");
var pomelo = require('pomelo');
var statusPlugin = require('pomelo-status-plugin');
var zmqRPC = require('pomelo-rpc-zeromq');
var appModels = require("../shared/models");
var logger = require('pomelo-logger').getLogger('sheath', __filename);
var Constants = require("../shared/constants");
var authFilter = require("./app/filters/authFilter");
var statsFilter = require("./app/filters/perfStatsFilter");
var Patcher = require("./app/utils/monkeyPatch");
var dispatcher = require("./app/utils/dispatcher");

/**
 * Init app for client.
 */
var app = pomelo.createApp();
app.set('name', 'sheath');
app.loadConfig("rethinkdb", app.getBase() + "/config/rethinkdb.json");
app.loadConfig("redis", app.getBase() + "/config/redis.json");
app.loadConfig("opLog", app.getBase() + "/config/opLog.json");
app.loadConfig("mKey", app.getBase() + "/config/mKey.json");
app.enable('systemMonitor');
app.before(pomelo.filters.toobusy(80));
app.before(new authFilter("connector.entryHandler.enter", "connector.entryHandler.enterPartition"));
app.registerAdmin(require('./app/modules/onlineUser'), {app: app});
app.registerAdmin(require('./app/modules/debugCommand'), {app: app});
app.registerAdmin(require('./app/modules/perfStats'), {app: app});

app.route("auth", dispatcher.defaultRouter);
app.route("chat", dispatcher.routeByPartition);
app.route("connector", dispatcher.defaultRouter);
app.route("game", dispatcher.defaultRouter);
app.route("manager", dispatcher.defaultRouter);

// set up stats filter for handlers and remotes
app.filter(statsFilter.handler);
app.rpcFilter(statsFilter.remote);

app.mKey = app.get("mKey");

app.set('remoteConfig', {
    rpcServer: zmqRPC.server
});

app.set('proxyConfig', {
    rpcClient: zmqRPC.client
});

app.set('connectorConfig', {
    connector: pomelo.connectors.hybridconnector,
    heartbeat: 5,
//    useProtobuf: true,
//    useDict: true
});

var rethinkConfig = app.get("rethinkdb");
appModels.init({
    host: rethinkConfig.host,
    port: rethinkConfig.port,
    database: rethinkConfig.database,
    poolMin: 10,
    poolMax: 300
});

var redisConfig = app.get("redis");
app.use(statusPlugin, {
    status: {
        host: redisConfig.host,
        port: redisConfig.port,
        prefix: "SHEATH:STATUS:" + app.settings.env,
        cleanOnStartUp: true,

        parser: "hiredis"
    }
});

// app configuration
app.configure('development', function () {
//    app.filter(pomelo.filters.time());
//    app.rpcFilter(pomelo.rpcFilters.rpcLog());
});

app.configure('development|production|test', "master", function () {
    app.registerAdmin(require('./app/components/cacheMon'), {app: app});
});

app.configure('development|production|test', "connector", function () {
    app.loadConfig("roleBootstrap", app.getBase() + "/config/data/roleBootstrap.json");
    app.loadConfig("energyTable", app.getBase() + "/config/data/energyTable.json");
    app.use(require('pomelo-protobuf-plugin'), {watchFile: false});
    app.load(require('./app/components/cache'), {role: "connector"});
});

app.configure('development|production|test', "game", function () {
    app.loadConfig("specialItemId", app.getBase() + "/config/data/specialItemId.json");
    app.loadConfig("rewardConfig", app.getBase() + "/config/data/reward.json");

    // Role tables
    app.loadConfig("roleBootstrap", app.getBase() + "/config/data/roleBootstrap.json");
    app.loadConfig("expTables", app.getBase() + "/config/data/expTables.json");
    app.loadConfig("energyTable", app.getBase() + "/config/data/energyTable.json");

    // Equipment tables
    app.loadConfig("growTable", app.getBase() + "/config/data/growTable.json");
    app.loadConfig("refineTable", app.getBase() + "/config/data/refineTable.json");

    // Hero tables
    app.loadConfig("heroRefineTable", app.getBase() + "/config/data/heroRefineTable.json");

    app.load(require('./app/components/cache'), {role: "game"});
//    profiler.profile({
//        accountKey: 'a09978fff59621ddf3fada92a8048789d0ca3ade',
//        appName: 'Sheath-Game'
//    });
});

function patchRPC(app) {
    setImmediate(function () {
        if (app.rpc)
            Patcher.patchRPC(app);
        else
            patchRPC(app);
    });
}

app.event.on(pomelo.events.ADD_SERVERS, function () {
    if (["connector", "game"].indexOf(app.settings.serverType) !== -1) {
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
        logger.error('exception. ' + err.stack);
    }
};

app.set("globalErrorHandler", errorHandler);
app.set("errorHandler", errorHandler);

// start app
app.start();

process.on('uncaughtException', function (err) {
    console.error(' Caught exception: ' + err.stack);
});
