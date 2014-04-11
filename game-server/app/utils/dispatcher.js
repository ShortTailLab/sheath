var _ = require("lodash");
var crc32 = require("sse4_crc32");

module.exports.dispatch = function(key, list) {
    return _.sample(list, 1);
};

module.exports.defaultRouter = function(session, msg, app, cb) {
    var servers = app.getServersByType(msg.serverType);
    var uid = session ? (session.uid || '') : '';

    if (servers.length === 1 || uid === '') {
        cb(null, servers[0].id);
    }
    else {

        cb(null, servers[Math.abs(crc32.calculate(uid)) % servers.length].id);
    }
};

module.exports.routeByPartition = function(session, msg, app, cb) {
    var servers = app.getServersByType(msg.serverType);
    var partId = session ? (session.get("partId") || '') : '';

    if (servers.length === 1 || partId === '') {
        cb(null, servers[0].id);
    }
    else {

        cb(null, servers[Math.abs(crc32.calculate(partId)) % servers.length].id);
    }
};
