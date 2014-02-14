var Promise = require("bluebird");
var logger = require('pomelo-logger').getLogger('sheath', __filename);
var jugglingdb = require("jugglingdb");

var Patcher = module.exports;

module.exports.patchRPC = function (app) {
    if (app.rpc.auth)
        Promise.promisifyAll(app.rpc.auth.authRemote);
    if (app.rpc.chat)
        Promise.promisifyAll(app.rpc.chat.chatRemote);
    if (app.rpc.manager)
        Promise.promisifyAll(app.rpc.manager.partitionStatsRemote);
    if (app.rpc.mail)
        Promise.promisifyAll(app.rpc.mail.mailRemote);
    if (app.get('sessionService'))
        Patcher.wrapModule(app.get('sessionService'), ["kick", "kickBySessionId"]);
    if (app.get('channelService'))
        Patcher.wrapModule(app.get('channelService'), ["pushMessageByUids"]);
    if (app.get('statusService'))
        Patcher.wrapModule(app.get('statusService'), ["getSidsByUid", "pushByUids"]);
};

module.exports.wrapModule = function (m, functions, suffix="") {
    for (let f of functions) {
        m[f + suffix] = Promise.promisify(m[f]);
    }
};

module.exports.wrapModel = function () {
    Patcher.wrapModule(jugglingdb.AbstractClass, ["update", "create", "upsert", "findOrCreate", "exists", "find", "all", "iterate", "findOne", "destroyAll", "count", "include"], "P");
    Patcher.wrapModule(jugglingdb.AbstractClass.prototype, ["save", "destroy", "updateAttribute", "updateAttributes", "reload"], "P");
};

function emptyFunc() {}

module.exports.wrapSession = function (sessionIns) {
    var sessionProto = Object.getPrototypeOf(sessionIns);
    if (!sessionProto.__async__wrapped__) {
        Patcher.wrapModule(sessionProto, ["bind", "unbind", "push", "pushAll"]);
        sessionProto.__async__wrapped__ = true;
        exports.wrapSession = emptyFunc;
    }
};
