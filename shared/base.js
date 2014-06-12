var Constants = require("./constants");
var models = require("./models");
var Promise = require("bluebird");
var _ = require("lodash");
var logger = require('pomelo-logger').getLogger('sheath', __filename);


class HandlerBase {
    errorNext(err, next) {
        var result = {error: {code: Constants.UnknownError}};
        if (err === undefined || err === null) {
        }
        if (typeof err === "number") {
            result.error.code = err;
        }
        else if (err.__sheath__error__) {
            result.error.code = err.code;
        }
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

    getStacks(role, newItemId=null, count=0) {
        var stack = 0;
        var cache = this.app.get("cache");
        var stackCounts = {};
        if (role.bag) {
            for (var i=0;i<role.bag.length;i++) {
                var item = role.bag[i];
                var key = item.itemDefId + "_" + item.level;
                if (!stackCounts[key]) stackCounts[key] = [item.itemDefId, 0];
                stackCounts[key][1] += 1;
            }
        }

        if (newItemId !== null) {
            var newItemKey = newItemId + "_1";
            if (!stackCounts[newItemKey]) stackCounts[newItemKey] = [newItemId, 0];
            stackCounts[key][1] += count;
        }

        _.each(stackCounts, function (value) {
            var itemDef = cache.getItemDef(value[0]);
            var stackSize = itemDef.stackSize || 1;
            stack += Math.ceil(value[1]/stackSize);
        });
        return stack;
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
