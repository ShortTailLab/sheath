var logger = require('pomelo-logger').getLogger(__filename);
var _ = require("lodash");
var Promise = require("bluebird");
var models = require("../../../shared/models");

module.exports = function(opts) {
    return new Module(opts);
};

module.exports.moduleId = 'debugCommand';

var Module = function(opts) {
    opts = opts || {};
    this.app = opts.app;
    this.interval = opts.interval || 5;
};

Module.prototype.monitorHandler = function(agent, msg, cb) {
    switch (msg.command) {
        case "kickAll":
            var ss = this.app.get("sessionService");
            ss.forEachSession(function (session) {
                ss.kickBySessionId(session.id);
            });
            break;
        case "broadcast":
            this.app.get("channelService").broadcast("connector", "onBroadcast", {message: msg.msg});
            break;
        case "chat":
        {
            var param = {
                msg: msg.msg,
                from: {
                    uid: "",
                    id: "",
                    name: "后台测试"
                },
                target: msg.msg.target || ''
            };
            this.app.get("channelService").broadcast("connector", "onChat", param);
            break;
        }
        case "mail":
            this.app.rpc.chat.mailRemote.sendTreasureMail.toServer(this.app.getServerId(), null, msg.msg.target, msg.msg.content, function (err, result) {});
            break;
        case "reloadTask":
//            this.app.rpc.game.taskRemote.notify.toServer(this.app.getServerId(), "levelUp", "f107392c-a5c6-4ffe-89f2-83a4c7a9ec60", {}, cb);
            this.app.rpc.game.taskRemote.reloadAllTasks.toServer(this.app.getServerId(), cb);
            break;
        case "addAnn":
            this.app.rpc.chat.announcementRemote.addAnn.toServer(this.app.getServerId(), msg.msg.annId, cb);
            break;
        case "delAnn":
            this.app.rpc.chat.announcementRemote.deleteAnn.toServer(this.app.getServerId(), msg.msg.annId, cb);
            break;
        case "push":
        {
            var target = msg.msg.target;
            var content = msg.msg.content;
            if (target === '') {
                this.app.rpc.chat.pushRemote.pushAll.toServer(this.app.getServerId(), content, cb);
            }
            else {
                Promise.join(models.Partition.get(target).run(), models.User.get(target).run(), models.Role.get(target).run()).bind(this)
                .spread(function (part, user, role) {
                    if (part) {
                        this.app.rpc.chat.pushRemote.pushToPartition.toServer(this.app.getServerId(), target, content, cb);
                    }
                    else if (user) {
                        this.app.rpc.chat.pushRemote.pushToUser.toServer(this.app.getServerId(), target, content, cb);
                    }
                    else if (role) {
                        this.app.rpc.chat.pushRemote.pushTo.toServer(this.app.getServerId(), target, content, cb);
                    }
                });
            }
            break;
        }
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
        case "push":
            forward(agent, "chat", "push", msg);
            break;
    }
};

function forward(agent, serverType, command, msg, cb) {
    if (!cb) {
        cb = function () {};
    }

    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === serverType; });
    var pending = servers.length;

    var waitAll = function () {
        if (--pending === 0) {
            cb();
        }
    };

    for (var i =0;i<servers.length;i++) {
        var server = servers[i];
        agent.request(server.id, module.exports.moduleId, {command: command, msg: msg}, waitAll);
    }
}
