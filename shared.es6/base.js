var Constants = require("./constants");
var models = require("./models");
var Promise = require("bluebird");
var _ = require("underscore");


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

    getItemWithDef(itemId) {
        return models.Item.findP(itemId).then((equipment) => {
            if (!equipment) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            return [equipment, models.ItemDef.findP(equipment.itemDefId)];
        }).bind(this);
    }

    getItemWithPrefixDef(itemId, prefix) {
        return this.getItemWithDef(itemId).all().spread((equipment, itemDef) => {
            if (!itemDef || !itemDef.type.startsWith(prefix)) {
                return Promise.reject(Constants.InvalidRequest);
            }
            return [equipment, itemDef];
        });
    }

    getEquipmentWithDef(equipmentId) {
        return this.getItemWithDef(equipmentId).all().spread((equipment, itemDef) => {
            if (!itemDef || !(itemDef.type.startsWith("WE_") || itemDef.type.startsWith("AR_"))) {
                return Promise.reject(Constants.InvalidRequest);
            }
            return [equipment, itemDef];
        });
    }

    getGemWithDef(itemId) {
        return this.getItemWithPrefixDef(itemId, "GEM_");
    }

    getItemStacks(roleId) {
        models.Item.allP({where: {owner: roleId}}).bind(this)
        .then((items) => {
            var itemGroups = _.groupBy(items, function (item) { return item.itemDefId + "_" + item.level; });
            var itemDefs = models.ItemDef.allP({where: {id: {inq: _.map(_.values(itemGroups), function (g) {return g[0].itemDefId;})}}});
            return [itemGroups, itemDefs];
        })
        .all().spread((itemGroups, itemDefs) => {
            itemDefs = _.groupBy(itemDefs, "id");
            var stack = 0;
            for (let itemId of itemGroups) {
                let stackSize = itemDefs[itemId][0].stackSize;
                stack += Math.ceil(itemGroups[itemId].length/stackSize);
            }
            return stack;
        });
    }

    toLogObj(role) {
        if (typeof role.toLogObj === "function") {
            return role.toLogObj();
        }
        else {
            return _.pick(this, "id", "name", "level", "title");
        }
    }
}

module.exports = {
    HandlerBase: HandlerBase
};
