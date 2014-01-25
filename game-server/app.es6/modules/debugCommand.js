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
            var cs = this.app.get("channelService");
            cs.broadcast("connector", "onBroadcast", {});
            break;
        case "chat":
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
            msg: msg.message || "Test msg."
        });
    }

    cb();
}

function chat(app, agent, msg, cb) {
    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === "connector"; });

    for (let server of servers) {
        agent.request(server.id, module.exports.moduleId, {command: "chat", msg: msg.message || "Test msg."});
    }

    cb();
}
