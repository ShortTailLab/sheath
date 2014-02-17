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

Module.prototype.monitorHandler = function(agent, msg, cb) {
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
            let param = {
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
            this.app.rpc.mail.mailRemote.sendTreasureMail.toServer(this.app.getServerId(), null, msg.msg.target, msg.msg.content, function (err, result) {});
            break;
    }
};

Module.prototype.masterHandler = function(agent, msg) {
};

Module.prototype.clientHandler = function(agent, msg, cb) {
    switch (msg.command) {
        case "kickAll":
            kickAll(this.app, agent, msg, cb);
            break;
        case "broadcast":
            broadcast(this.app, agent, msg, cb);
            break;
        case "chat":
            chat(this.app, agent, msg, cb);
            break;
        case 'mail':
            mail(this.app, agent, msg, cb);
            break;
    }
};

function kickAll(app, agent, msg, cb) {
    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === "connector"; });

    for (let server of servers) {
        agent.request(server.id, module.exports.moduleId, {command: "kickAll"});
    }

    cb();
}

function broadcast(app, agent, msg, cb) {
    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === "connector"; });

    for (let server of servers) {
        agent.request(server.id, module.exports.moduleId, {
            command: "broadcast",
            msg: msg.content || "Test msg."
        });
    }

    cb();
}

function chat(app, agent, msg, cb) {
    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === "connector"; });

    for (let server of servers) {
        agent.request(server.id, module.exports.moduleId, {command: "chat", msg: msg.content || "Test msg."});
    }

    cb();
}

function mail(app, agent, msg, cb) {
    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === "mail"; });

    if (servers.length) {
        agent.request(servers[0].id, module.exports.moduleId, {command: "mail", msg: msg});
    }

    cb();
}
