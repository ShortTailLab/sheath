var _ = require("lodash");
var Constants = require("../../../shared/constants");
var Deque = require("double-ended-queue");

class PerfFilter {
    constructor() {
        this.handler = {before: this.HBefore.bind(this), after: this.HAfter.bind(this)};
        this.remote = {before: this.RBefore.bind(this), after: this.RAfter.bind(this)};
        this.statDict = {};
    }

    statObject(msg) {
        var key = msg.__route__;
        if (!key) {
            if (msg.namespace === "user") {
                key = msg.serverType + "." + msg.service + "." + msg.method;
            }
            else if (msg.namespace === "sys") {
                key = msg.args[0].route + ".";
            }
            else {
                return null;
            }
        }
        var s = this.statDict[key];
        if (!s) {
            this.statDict[key] = s = new Deque(1024);
        }
        return s;
    }

    HBefore(msg, session, next) {
        var s = this.statObject(msg);
        if (s) {
            msg.__startTime__ = Date.now();
        }
        next();
    }

    HAfter(err, msg, session, resp, next) {
        var s = this.statObject(msg);
        if (s && msg.__startTime__) {
            var timeUsed = Date.now() - msg.__startTime__;
            s.push(timeUsed);
        }
        next();
    }

    RBefore(serverId, msg, opts, next) {
        var s = this.statObject(msg);
        if (s) {
            opts.__startTime__ = Date.now();
        }
        next();
    }

    RAfter(serverId, msg, opts, next) {
        var s = this.statObject(msg);
        if (s && opts.__startTime__) {
            var timeUsed = Date.now() - opts.__startTime__;
            s.push(timeUsed);
        }
        next();
    }
}

module.exports = new PerfFilter();
