var logger = require('pomelo-logger').getLogger(__filename);
var _ = require("lodash");
var Promise = require("bluebird");
var models = require("../../../shared/models");
var utils = require("../../../shared/utils");

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
            utils.forward(module.exports.moduleId, agent, "connector", "kickAll", null, cb);
            break;
        case "broadcast":
            utils.forward(module.exports.moduleId, agent, "connector", "broadcast", msg.content || "Test msg.", cb);
            break;
        case "chat":
            utils.forward(module.exports.moduleId, agent, "connector", "chat", msg.content || "Test msg.", cb);
            break;
        case 'mail':
            utils.forward(module.exports.moduleId, agent, "chat", "mail", msg, cb);
            break;
        case "reloadTask":
            utils.forward(module.exports.moduleId, agent, "game", "reloadTask", msg, cb);
            break;
        case "addAnn":
            utils.forward(module.exports.moduleId, agent, "chat", "addAnn", msg, cb);
            break;
        case "delAnn":
            utils.forward(module.exports.moduleId, agent, "chat", "delAnn", msg, cb);
            break;
        case "push":
            utils.forward(module.exports.moduleId, agent, "chat", "push", msg);
            break;
    }
};
