var Constants = require("./constants");
var models = require("./models");
var Promise = require("bluebird");
var r = require("rethinkdb");
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
        return models.Item.findP(itemId).bind(this)
        .then(function (item){
            if (!item) {
                return Promise.reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
            }
            else {
                var itemDef = this.app.get("cache").getItemDef(item.itemDefId);
                return [item, itemDef];
            }
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

    getItemStacks(roleId) {
        models.Item.allP({where: {owner: roleId}}).bind(this)
        .then((items) => {
            var itemGroups = _.groupBy(items, function (item) { return item.itemDefId + "_" + item.level; });
            var cache = this.app.get("cache");
            var stack = 0;
            _.each(itemGroups, function (value) {
                var itemDef = cache.getItemDef(value[0].itemDefId);
                var stackSize = itemDef.stackSize || 1;
                stack += Math.ceil(value.length/stackSize);
            });
            return stack;
        });
    }

    evalRandAtom(atom) {
        var randValue = Math.random() * 100;
        for (var i=0;i<atom.length;i++) {
            if (randValue < atom[i+1])
                return atom[i];
        }
        return atom[atom.length-2];
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
