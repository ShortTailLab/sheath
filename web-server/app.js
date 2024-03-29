/**
 * Module dependencies
 */
require("../shared/traceurBootstrap");
var express = require('express'),
    http = require('http'),
    spdy = require('spdy'),
    ws = require("ws"),
    fs = require("fs"),
    path = require('path'),
    Promise = require("bluebird"),
    wsLive = require("./ws-live"),
    pomeloConn = require("./pomelo-conn"),
    appModels = require("../shared/models");

var app = express();
var pub = __dirname + '/public';
var view = __dirname + '/views';
var dbConfig = require("../game-server/config/rethinkdb.json");
var redisConfig = require("../game-server/config/redis.json");

switch (process.env.NODE_ENV) {
    case "production":
        dbConfig = dbConfig.production;
        redisConfig = redisConfig.production;
        break;
    case "test":
        dbConfig = dbConfig.test;
        redisConfig = redisConfig.test;
        break;
    default:
        dbConfig = dbConfig.development;
        redisConfig = redisConfig.development;
        break;
}

appModels.init({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    poolMax: 100
});

var routes = require('./routes');
var api = require('./routes/api');

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
});

app.configure('test', function () {
    var oneYear = 31557600000;
    app.set('view cache', true);
    app.use(express.logger('dev'));
    app.use(express.static(pub, {maxAge: oneYear}));
    app.use(express.errorHandler({dumpExceptions: true, showStack: true}));
});

app.configure('production', function () {
    var oneYear = 31557600000;
    app.use(express.static(pub, {maxAge: oneYear}));
    app.use(express.errorHandler());
});

// all environments
app.enable('trust proxy');
app.set('port', process.env.PORT || 7000);
app.set('views', view);
app.set('view engine', 'jade');
app.use(express.bodyParser());
app.use(express.cookieParser());

var RedisStore = require("connect-redis")(express);
app.use(express.session({
    store: new RedisStore({
        host: redisConfig.host,
        port: redisConfig.port,
        prefix: "sess." + process.env.NODE_ENV,

        parser: "hiredis"
    }),
    secret: '435+43@#$234@$#44299'
}));

app.use(app.router);

/**
 * Routes
 */

app.post("/op_purchase_cb", routes.purchase);

// serve index and view partials
app.get('/login', routes.login);
app.post('/login', routes.postLogin);
app.get('/logout', routes.logout);

app.get('/', restrict, routes.index);
app.get('/partials/:name', routes.partials);
app.get('/templates/:name', routes.templates);

app.get("/download", routes.logRedirect);

// JSON API
app.get('/api/nodeInfo', restrictAPI, api.nodeInfo);
app.get('/api/basicStats', restrictAPI, api.basicStats);
app.get('/api/partitions', restrictAPI, api.partitions);
app.post('/api/addPartitions', restrictAPI, api.addPartition);
app.post('/api/removePartition', restrictAPI, api.removePartition);

app.post('/api/userList', restrictAPI, api.userList);
app.post('/api/cloneRole', restrictAPI, api.cloneRole);
app.post('/api/updateRole', restrictAPI, api.updateRole);
app.post('/api/updateItem', restrictAPI, api.updateItem);
app.post('/api/updateHero', restrictAPI, api.updateHero);

app.post('/api/adminList', restrictAPI, api.adminList);
app.post('/api/modifyAdmin', restrictAPI, api.modifyAdmin);
app.post('/api/removeAdmin', restrictAPI, api.removeAdmin);
app.post('/api/addAdmin', restrictAPI, api.addAdmin);

app.post('/api/import', restrictAPI, api.import);
app.post('/api/export', restrictAPI, api.export);
app.get('/api/itemDefs', restrictAPI, api.itemDefs);
app.get('/api/heroDefs', restrictAPI, api.heroDefs);
app.get('/api/heroDraws', restrictAPI, api.heroDraws);
app.get('/api/heroNodes', restrictAPI, api.heroNodes);
app.get('/api/equipmentDefs', restrictAPI, api.equipmentDefs);
app.get('/api/levels', restrictAPI, api.levels);
app.get('/api/treasures', restrictAPI, api.treasures);
app.get('/api/tasks', restrictAPI, api.tasks);
app.get('/api/anns', restrictAPI, api.anns);
app.get('/api/storeitems', restrictAPI, api.storeitems);

app.post('/api/updateAnn', restrictAPI, api.updateAnn);
app.post('/api/saveAnn', restrictAPI, api.saveAnn);
app.post('/api/removeAnn', restrictAPI, api.removeAnn);

app.post('/api/findUsers', restrictAPI, api.findUsers);
app.post('/api/findRoles', restrictAPI, api.findRoles);
app.post('/api/getRole', restrictAPI, api.getRole);
app.post('/api/addHero', restrictAPI, api.addHero);
app.post('/api/addItem', restrictAPI, api.addItem);
app.post('/api/removeHero', restrictAPI, api.removeHero);
app.post('/api/removeItem', restrictAPI, api.removeItem);

app.post('/api/kickAll', restrictAPI, api.kickAll);
app.post('/api/reloadTask', restrictAPI, api.reloadTask);
app.post('/api/broadcast', restrictAPI, api.broadcast);
app.post('/api/chat', restrictAPI, api.chat);
app.post('/api/sendMail', restrictAPI, api.sendMail);
app.post('/api/resetPerfStats', restrictAPI, api.resetPerfStats);
app.post('/api/getPerfStats', restrictAPI, api.getPerfStats);

app.post('/api/gameLevel', api.importInGameReward);

app.post('/api/getStatInfo', restrictAPI, api.getStatInfo);
app.post('/api/refreshStats', restrictAPI, api.refreshStats);
app.post('/api/sendNotification', restrictAPI, api.sendNotification);

app.get('/js/lib/*.map', function (req, res) { res.send(404); });
app.get('*', restrict, routes.index);

var server = spdy.createServer({
    key: fs.readFileSync(__dirname + '/keys/server.key'),
    cert: fs.readFileSync(__dirname + '/keys/server.crt'),
    ca: fs.readFileSync(__dirname + '/keys/server.csr')
}, app);

try {
    http.createServer(function (req, res) {
        res.writeHead(302, {Location: "https://"+ req.headers.host + req.url});
        res.end();
    }).listen(80);
}
catch (err) {
}

//var server = http.createServer(app);

/**
 * websocket connection
 */
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
    console.error(' Caught exception: ' + err + ". stack = " + err.stack);
});

app.on('error', function(err) {
    console.error('app on error:' + err.stack);
});
