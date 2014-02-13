//var profiler = require("nodetime");
require("traceur");
var pomelo = require('pomelo');
var dataPlugin = require('pomelo-data-plugin');
var appModels = require("../shared/models");
var logger = require('pomelo-logger').getLogger('sheath', __filename);
var Constants = require("../shared/constants");
var authFilter = require("./app/filters/authFilter");
var Patcher = require("./app/utils/monkeyPatch");
var dispatcher = require("./app/utils/dispatcher");

/**
 * Init app for client.
 */
var app = pomelo.createApp();
app.set('name', 'sheath');
app.loadConfig("rethinkdb", app.getBase() + "/config/rethinkdb.json");
app.enable('systemMonitor');
app.before(pomelo.filters.toobusy(80));

//app.set('remoteConfig', {
//    acceptorFactory: {create: function(opts, cb) {
//        return require("pomelo/node_modules/pomelo-rpc").server.TcpAcceptor.create(opts, cb);
//    }}
//});
//
//app.set('proxyConfig', {
//    mailboxFactory: {create: function(opts, cb) {
//        return require("pomelo/node_modules/pomelo-rpc/lib/rpc-client/mailboxes/tcp-mailbox").create(opts, cb);
//    }}
//});

// app configuration
app.configure("development|production|test", 'connector', function () {
    app.set('connectorConfig',
        {
            connector: pomelo.connectors.hybridconnector,
            heartbeat: 5,
            useDict: true,
            useProtobuf: true
        });
});

app.configure("development|production|test", 'auth|connector|game|manager', function () {
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

//app.configure('development|production|test', "game", function () {
//    profiler.profile({
//        accountKey: 'a09978fff59621ddf3fada92a8048789d0ca3ade',
//        appName: 'Sheath-Game'
//    });
//});

app.configure(function () {
    app.before(new authFilter("connector.entryHandler.enter", "connector.entryHandler.enterPartition"));
    app.registerAdmin(require('./app/modules/onlineUser'), {app: app});
    app.registerAdmin(require('./app/modules/debugCommand'), {app: app});
    app.route('main', mailRoute);

    app.use(dataPlugin, {
        watcher: {
            dir: __dirname + "/config/data",
            idx: "id",
            interval: 5000
        }
    });
});

function patchRPC(app) {
    setImmediate(function () {
        if (app.rpc)
            Patcher.patchRPC(app);
        else
            patchRPC(app);
    });
}

var mailRoute = function (session, msg, app, cb) {
    var chatServers = app.getServersByType('chat');

    if(!chatServers || chatServers.length === 0) {
        cb(new Error('can not find chat servers.'));
        return;
    }

    var res = dispatcher.dispatch(session.uid, chatServers);

    cb(null, res.id);
};

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
    console.error(' Caught exception: ' + err + ". stack = " + err.stack);
});
