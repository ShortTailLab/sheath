var logger = require('pomelo-logger').getLogger(__filename);
var _ = require("underscore");

module.exports = function(opts) {
    return new Module(opts);
};

module.exports.moduleId = 'cacheMonitor';

var Module = function(opts) {
    opts = opts || {};
    this.app = opts.app;
    this.cacheIns = opts.cache;
};

Module.prototype.monitorHandler = function(agent, msg, cb) {
    switch (msg.type) {
        case "heroDef":
            this.cacheIns.loadHeroDef();
            break;
        case "itemDef":
            this.cacheIns.loadItemDef();
            break;
        case "equipmentDef":
            this.cacheIns.loadEquipmentDef();
            break;
        case "level":
            this.cacheIns.loadLevel();
            break;
        case "storeitem":
            this.cacheIns.loadStoreItem();
            break;
        case "heronode":
            this.cacheIns.loadHeroNode();
            break;
    }
};

Module.prototype.masterHandler = function(agent, msg) {
};

Module.prototype.clientHandler = function(agent, msg, cb) {
    var servers = _.filter(_.values(agent.idMap), function (r) { return r.type === "game"; });
    var pending = servers.length;
    var waitAll = function () {
        if (--pending === 0) {
            cb();
        }
    };

    for (var i =0;i<servers.length;i++) {
        var server = servers[i];
        agent.request(server.id, module.exports.moduleId, msg, waitAll);
    }
};
