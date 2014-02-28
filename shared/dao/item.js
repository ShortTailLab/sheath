var models = require("../models");
var Constants = require("../constants");
var _ = require("underscore");
var Promise = require("bluebird");

class ItemHelper {
    getFormationBook(formationId) {
        if (0 <= formationId < 7) {

        }
        else {
            return [];
        }
    }
}

module.exports = new ItemHelper();
