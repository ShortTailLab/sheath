var models = require("../../../../../shared/models");
var Promise = require("bluebird");
var logger;


module.exports = function (app) {
    return new EquipmentHandler(app);
};

class EquipmentHandler {
    constructor(app) {
        this.app = app;
    }
}
