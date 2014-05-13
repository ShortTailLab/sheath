var Constants = require("./constants");
var models = require("./models");
var Promise = require("bluebird");
var _ = require("lodash");
var logger = require('pomelo-logger').getLogger('sheath', __filename);


class HandlerBase {
    errorNext(err, next) {
        var result = {error: {code: Constants.UnknownError}};
        if (typeof err === "number")
            result.error.code = err;
        else if (err.__sheath__error__)
            result.error.code = err.code;
        if (typeof err.message === "string") {
            result.error.message = err.message;
            logger.error('handler error. ' + err.message + (err.stack || ""));
        }
        next(null, result);
    }

    safe(promise, next) {
        promise.catch((err) => {this.errorNext(err, next);});
    }

    getItemWithDef(itemId) {
        return models.Item.get(itemId).run().bind(this)
        .then(function (item){
            var itemDef = this.app.get("cache").getItemDef(item.itemDefId);
            return [item, itemDef];
        })
        .catch(function (err) {
            return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
        });
    }

    getEquipmentWithDef(equipmentId) {
        return this.getItemWithDef(equipmentId).then((results) => {
            var itemDef = results[1];
            var cache = this.app.get("cache");
            if (!itemDef || !cache.equipmentDefById[itemDef.id]) {
                return Promise.reject(Constants.InvalidRequest);
            }
            return results;
        });
    }

    getGemWithDef(itemId) {
        return this.getItemWithDef(itemId).then((results) => {
            var itemDef = results[1];
            if (!itemDef || itemDef.type !== "宝石") {
                return Promise.reject(Constants.InvalidRequest);
            }
            return results;
        });
    }

    getItemStacks(roleId, newItemId=null, count=0) {
        return models.Item.getAll(roleId, {index: "owner"}).run().bind(this)
        .then((items) => {
            var itemGroups = _.groupBy(items, function (item) { return item.itemDefId + "_" + item.level; });
            var cache = this.app.get("cache");
            var stack = 0;

            if (newItemId !== null) {
                var newItemKey = newItemId + "_1";
                itemGroups[newItemKey] = itemGroups[newItemKey] || [];
                itemGroups[newItemKey].length += count;
                for (var i=1;i<=count;i++) {
                    itemGroups[newItemKey][itemGroups[newItemKey].length - i] = {itemDefId: newItemId};
                }
            }

            _.each(itemGroups, function (value) {
                var itemDef = cache.getItemDef(value[0].itemDefId);
                var stackSize = itemDef.stackSize || 1;
                stack += Math.ceil(value.length/stackSize);
            });
            return stack;
        });
    }

    evalRandAtom(atom, randFunc=Math.random) {
        var randValue = randFunc() * 100;
        var accum = 0;
        for (var i=0;i<atom.length;i++) {
            accum += atom[i+1];
            if (randValue < accum)
                return atom[i];
        }
        return atom.length >=2 ? atom[atom.length-2] : 0;
    }

    toLogObj(role) {
        if (typeof role.toLogObj === "function") {
            return role.toLogObj();
        }
        else {
            return _.pick(role, "id", "name", "level", "title");
        }
    }
}

module.exports = {
    HandlerBase: HandlerBase
};
