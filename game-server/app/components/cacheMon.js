var logger = require('pomelo-logger').getLogger(__filename);
var _ = require("lodash");

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
        case "herodef":
            this.cacheIns.loadHeroDef();
            break;
        case "gemdef":
        case "itemdef":
            this.cacheIns.loadItemDef();
            break;
        case "equipmentdef":
            this.cacheIns.loadEquipmentDef();
            break;
        case "level":
            this.cacheIns.loadLevel();
            break;
        case "storeitem":
            this.cacheIns.loadStoreItem();
            break;
        case "drawnode":
        case "herodraw":
            this.cacheIns.loadHeroDraws();
            break;
        case "partition":
            this.cacheIns.loadPartition();
            break;
        default:
            console.warn("cache do not have type: " + msg.type);
    }
};

Module.prototype.masterHandler = function(agent, msg) {
};

Module.prototype.clientHandler = function(agent, msg, cb) {
    var serverTypes = [];
    if (msg.server) serverTypes = [msg.server];
    else {
        switch (msg.type) {
            case "herodef":
            case "itemdef":
            case "equipmentdef":
            case "gemdef":
            case "level":
                serverTypes = ["game", "connector"];
                break;
            case "storeitem":
            case "drawnode":
            case "herodraw":
                serverTypes = ["game"];
                break;
            case "partition":
                serverTypes = ["connector"];
                break;
            default:
                console.warn("cache do not have type: " + msg.type);
        }
    }

    var servers = _.filter(_.values(agent.idMap), function (r) { return _.contains(serverTypes, r.type); });
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
