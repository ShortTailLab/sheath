var logger = require('pomelo-logger').getLogger(__filename);
var _ = require("underscore");

module.exports = function(opts) {
    return new Module(opts);
};

module.exports.moduleId = 'debugCommand';

var Module = function(opts) {
    opts = opts || {};
    this.app = opts.app;
    this.interval = opts.interval || 5;
};

Module.prototype.monitorHandler = function(agent, msg) {
    switch (msg.command) {
        case "kickAll":
            var ss = this.app.get("sessionService");
            ss.forEachSession(function (session) {
                ss.kickBySessionId(session.id);
            });
            break;
        case "broadcast":
            this.app.get("channelService").broadcast("connector", "onBroadcast", {message: msg.msg.content});
            break;
        case "chat":
        {
            var param = {
                msg: msg.content,
                from: {
                    uid: "",
                    id: "",
                    name: "后台测试"
                },
                target: msg.target
            };
            this.app.get("channelService").broadcast("connector", "onChat", param);
            break;
        }
        case "mail":
            this.app.rpc.chat.mailRemote.sendTreasureMail.toServer(this.app.getServerId(), null, msg.msg.target, msg.msg.content, function (err, result) {});
            break;
        case "reloadTask":
//            this.app.rpc.game.taskRemote.notify.toServer(this.app.getServerId(), "levelUp", "f107392c-a5c6-4ffe-89f2-83a4c7a9ec60", {}, function (err, result) {});
            this.app.rpc.game.taskRemote.reloadAllTasks.toServer(this.app.getServerId(), function (err, result) {});
            break;
        case "addAnn":
            this.app.rpc.chat.announcementRemote.addAnn.toServer(this.app.getServerId(), msg.annId, function (err, result) {});
            break;
        case "delAnn":
            this.app.rpc.chat.announcementRemote.deleteAnn.toServer(this.app.getServerId(), msg.annId, function (err, result) {});
            break;
    }
};

Module.prototype.masterHandler = function(agent, msg) {
};

Module.prototype.clientHandler = function(agent, msg, cb) {
    switch (msg.command) {
        case "kickAll":
            forward(agent, "connector", "kickAll", null, cb);
            break;
        case "broadcast":
            forward(agent, "connector", "broadcast", msg.content || "Test msg.", cb);
            break;
        case "chat":
            forward(agent, "connector", "chat", msg.content || "Test msg.", cb);
            break;
        case 'mail':
            forward(agent, "chat", "mail", msg, cb);
            break;
        case "reloadTask":
            forward(agent, "game", "reloadTask", msg, cb);
            break;
        case "addAnn":
            forward(agent, "chat", "addAnn", msg, cb);
            break;
        case "delAnn":
            forward(agent, "chat", "delAnn", msg, cb);
            break;
    }
};

function forward(agent, serverType, command, msg, cb) {
    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === serverType; });

    for (var i =0;i<servers.length;i++) {
        var server = servers[i];
        agent.request(server.id, module.exports.moduleId, {command: command, msg: msg});
    }

    cb();
}
