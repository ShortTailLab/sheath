var logger = require('pomelo-logger').getLogger(__filename);
var _ = require("lodash");
var Promise = require("bluebird");
var models = require("../../../shared/models");
var utils = require("../../../shared/utils");
var perfFilter = require("../filters/perfStatsFilter");
var Stats = require('fast-stats').Stats;

module.exports = function(opts) {
    return new Module(opts);
};

module.exports.moduleId = 'perf';

var Module = function(opts) {
    opts = opts || {};
    this.app = opts.app;
    this.type = opts.type || 'pull';
    this.interval = opts.interval || 5;
};

Module.prototype.monitorHandler = function(agent, msg, cb) {
    if (!msg) {
        var stat = {
            source: this.app.getServerId(),
            stat: _.mapValues(perfFilter.statDict, function (s) {
                var ret = s.toArray();
                s.clear();
                return ret;
            })
        };
        agent.notify(module.exports.moduleId, stat);
        return;
    }
    switch (msg.command) {
        case "reset":
            perfFilter.statDict = {};
            cb();
            break;
    }
};

function merge(dict, stat) {
    _.map(stat, function (value, key) {
        var s = dict[key] = dict[key] || new Stats({bucket_precision: 2, store_data: false});
        s.push(value);
    });
}

Module.prototype.masterHandler = function(agent, msg) {
    if(!msg) {
        // pull interval callback
        agent.notifyAll(module.exports.moduleId);
    }
    else {
        var data = agent.get(module.exports.moduleId);
        if (!data) {
            data = {accum: {}};
            agent.set(module.exports.moduleId, data);
        }

        data[msg.source] = data[msg.source] || {};
        merge(data.accum, msg.stat);
        merge(data[msg.source], msg.stat);
    }
};

Module.prototype.clientHandler = function(agent, msg, cb) {
    switch (msg.command) {
        case "collect":
        {
            var ret = agent.get(module.exports.moduleId);
            ret = _.mapValues(ret, function (serverStats) {
                return _.mapValues(serverStats, function (s) {
                    return {
                        "count": s.length,
                        "min": parseFloat((s.min || 0).toFixed(2)),
                        "mean": parseFloat(s.amean().toFixed(2)),
                        "median": parseFloat(s.median().toFixed(2)),
                        "percentile98": parseFloat(s.percentile(98).toFixed(2)),
                        "max": parseFloat((s.max || 0).toFixed(2))
                    };
                });
            });
            cb(null, ret);
            break;
        }
        case "reset":
            utils.forward(module.exports.moduleId, agent, "*", "reset", null, cb);
            agent.set(module.exports.moduleId, null);
            cb();
            break;
    }
};
