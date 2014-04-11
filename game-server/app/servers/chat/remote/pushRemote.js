var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Promise = require("bluebird");

module.exports = function (app) {
    return new PushRemote(app);
};

class PushRemote extends base.HandlerBase {
    constructor(app) {
        this.app = app;
    }

    pushTo(user, onlinePolicy) {

    }
}
