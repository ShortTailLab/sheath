var logger = require('pomelo-logger').getLogger(__filename);

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
};

Module.prototype.masterHandler = function(agent, msg) {
};

Module.prototype.clientHandler = function(agent, msg, cb) {
    switch (msg.command) {
        case "kickAll":
            break;
        case "broadcast":
            break;
        case "chat":
            break;
    }
};
