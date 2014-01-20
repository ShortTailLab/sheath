/**
 * Module dependencies
 */

var express = require('express'),
    http = require('http'),
    ws = require("ws"),
    traceur = require("traceur"),
    path = require('path'),
    Promise = require("bluebird"),
    wsLive = require("./ws-live"),
    routes = require('./routes'),
    api = require('./routes/api'),
    pomeloConn = require("./pomelo-conn"),
    appModels = require("../shared/models"),
    Patcher = require("../game-server/app/utils/monkeyPatch");

var app = express();
var pub = __dirname + '/public';
var view = __dirname + '/views';
var dbConfig = require("./config/rethinkdb.json");

function restrict(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

function restrictAPI(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.send(401);
    }
}

/**
 * Configuration
 */
app.use(express.compress());
app.configure('development', function () {
    app.use(express.logger('dev'));
    app.use(express.static(pub));
    app.use(express.errorHandler({dumpExceptions: true, showStack: true}));

    Patcher.wrapModel();
    appModels.init({
        host: dbConfig.development.host,
        port: dbConfig.development.port,
        database: dbConfig.development.database,
        poolMax: 100
    }).connect();
});

app.configure('test', function () {
    app.use(express.logger('dev'));
    app.use(express.static(pub));
    app.use(express.errorHandler({dumpExceptions: true, showStack: true}));

    Patcher.wrapModel();
    appModels.init({
        host: dbConfig.test.host,
        port: dbConfig.test.port,
        database: dbConfig.test.database,
        poolMax: 100
    }).connect();
});

app.configure('production', function () {
    var oneYear = 31557600000;
    app.use(express.static(pub, {maxAge: oneYear}));
    app.use(express.errorHandler());

    Patcher.wrapModel();
    appModels.connect({
        host: dbConfig.production.host,
        port: dbConfig.production.port,
        database: dbConfig.production.database,
        poolMax: 100
    }).connect();
});

// all environments
app.enable('trust proxy');
app.set('port', process.env.PORT || 7000);
app.set('views', view);
app.set('view engine', 'jade');
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({secret: '435+43@#$234@$#44299'}));
app.use(app.router);

/**
 * Routes
 */

// serve index and view partials
app.get('/login', routes.login);
app.post('/login', routes.postLogin);
app.get('/logout', routes.logout);

app.get('/', restrict, routes.index);
app.get('/partials/:name', routes.partials);
app.get('/templates/:name', routes.templates);

// JSON API
app.get('/api/nodeInfo', restrictAPI, api.nodeInfo);
app.get('/api/basicStats', restrictAPI, api.basicStats);
app.get('/api/partitions', restrictAPI, api.partitions);
app.post('/api/addPartitions', restrictAPI, api.addPartition);
app.post('/api/removePartition', restrictAPI, api.removePartition);
app.post('/api/userList', restrictAPI, api.userList);
app.post('/api/adminList', restrictAPI, api.adminList);
app.post('/api/modifyAdmin', restrictAPI, api.modifyAdmin);
app.post('/api/removeAdmin', restrictAPI, api.removeAdmin);
app.post('/api/addAdmin', restrictAPI, api.addAdmin);

app.post('/api/import', restrictAPI, api.import);
app.post('/api/export', restrictAPI, api.export);

app.post('/api/findUsers', restrictAPI, api.findUsers);

app.get('*', restrict, routes.index);

/**
 * websocket connection
 */
var server = http.createServer(app);
var wss = new ws.Server({server: server});
wsLive(wss);

/**
 * Start Server
 */

pomeloConn.client.request = Promise.promisify(pomeloConn.client.request);
pomeloConn.connect();

server.listen(app.get('port'));
console.log('Express server listening on port ' + app.get('port'));

// Uncaught exception handler
process.on('uncaughtException', function (err) {
    console.error(' Caught exception: ' + err.stack);
});

app.on('error', function(err) {
    console.error('app on error:' + err.stack);
});
