var Promise = require("bluebird");
var logger = require('pomelo-logger').getLogger('sheath', __filename);

var Patcher = module.exports;

module.exports.patchRPC = function (app) {
    if (app.rpc.auth)
        Promise.promisifyAll(app.rpc.auth.authRemote);
    if (app.rpc.chat)
        Promise.promisifyAll(app.rpc.chat.chatRemote);
    if (app.rpc.manager)
        Promise.promisifyAll(app.rpc.manager.partitionStatsRemote);
    if (app.rpc.game)
        Promise.promisifyAll(app.rpc.game.taskRemote);
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
    for (var i=0;i<functions.length;i++) {
        var name = functions[i];
        m[name + suffix] = Promise.promisify(m[name]);
    }
};

function emptyFunc() {}

module.exports.wrapSession = function (sessionIns) {
    if (!sessionIns.__async__wrapped__) {
        var sessionProto = Object.getPrototypeOf(sessionIns);
        Patcher.wrapModule(sessionProto, ["bind", "unbind", "push", "pushAll"]);
        sessionProto.__async__wrapped__ = true;
        exports.wrapSession = emptyFunc;
    }
};
