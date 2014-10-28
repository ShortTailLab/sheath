var logger = require('pomelo-logger').getLogger(__filename);
var _ = require('lodash');

module.exports = function(opts) {
	return new Module(opts);
};

module.exports.moduleId = 'onlineUser';

var Module = function(opts) {
	opts = opts || {};
	this.app = opts.app;
	this.type = opts.type || 'pull';
	this.interval = opts.interval || 5;
};

Module.prototype.monitorHandler = function(agent, msg) {
	var connectionService = this.app.components.__connection__;
    var sessionService = this.app.components.__session__;
	if(!connectionService || !sessionService) {
		logger.error('not support connection: %j', agent.id);
		return;
	}
    var stats = connectionService.getStatisticsInfo();
	stats.loginedList = stats.loginedList || [];
    for (var i=0;i<stats.loginedList.length;i++) {
        var user = stats.loginedList[i];
        var sessions = sessionService.getByUid(user.uid);
        if (sessions.length && sessions[0].get("role")) {
            user.role = _.pick(sessions[0].get("role"), "id", "name", "team", "level", "title", "partition");
        }
    }

	agent.notify(module.exports.moduleId, stats);
};

Module.prototype.masterHandler = function(agent, msg) {
	if(!msg) {
		// pull interval callback
		var list = agent.typeMap.connector;
		if(!list || list.length === 0) {
			return;
		}
		agent.notifyByType('connector', module.exports.moduleId);
		return;
	}

	var data = agent.get(module.exports.moduleId);
	if(!data) {
		data = {};
		agent.set(module.exports.moduleId, data);
	}

	data[msg.serverId] = msg;
};

Module.prototype.clientHandler = function(agent, msg, cb) {
	cb(null, agent.get(module.exports.moduleId));
};
