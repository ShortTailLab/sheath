var _ = require("lodash");
var Constants = require("../../../shared/constants");
var Stats = require('fast-stats').Stats;

class PerfFilter {
    constructor() {
        this.handler = {before: this.HBefore.bind(this), after: this.HAfter.bind(this)};
        this.remote = {before: this.RBefore.bind(this), after: this.RAfter.bind(this)};
        this.statDict = {};
    }

    statObject(msg) {
        var key = "";
        var s = this.statDict[key];
        if (!s) {
            this.statDict[key] = s = new Stats({bucket_precision: 2, store_data: false});
        }
        return s;
    }

    HBefore(msg, session, next) {
        var s = this.statObject(msg);
        next();
    }

    HAfter(err, msg, session, resp, next) {
        var s = this.statObject(msg);
        next();
    }

    RBefore(serverId, msg, opts, next) {
        var s = this.statObject(msg);
        next();
    }

    RAfter(serverId, msg, opts, next) {
        var s = this.statObject(msg);
        next();
    }
}

module.exports = PerfFilter;
