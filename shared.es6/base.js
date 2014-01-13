var Constants = require("./constants");
var models = require("./models");
var Promise = require("bluebird");


class HandlerBase {
    errorNext(err, next) {
        var result = {error: {code: Constants.UnknownError}};
        if (typeof err === "number")
            result.error.code = err;
        else if (err.__sheath__error__)
            result.error.code = err.code;
        if (typeof err.message === "string")
            result.error.message = err.message;
        next(null, result);
    }

    safe(promise, next) {
        promise.catch((err) => {this.errorNext(err, next);});
    }

    getItemWithDef(equipmentId) {
        return models.Item.findP(equipmentId).then((equipment) => {
            if (!equipment) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            else {
                return [equipment, models.ItemDef.findP(equipment.itemDefId)];
            }
        }).bind(this);
    }
}

module.exports = {
    HandlerBase: HandlerBase
};
