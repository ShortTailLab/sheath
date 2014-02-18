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
        return new Promise(function (resolve, reject) {
            var equipment = new models.Item();
            var adapter = equipment._adapter();
            adapter.pool.acquire(function(error, client) {
                r.db(adapter.database).table("item").getAll(itemId).eqJoin("itemDefId", r.db(adapter.database).table("itemdef")).run(client, function(err, data) {
                    if (err || data.length === 0) {
                        reject(Constants.EquipmentFailed.DO_NOT_OWN_ITEM);
                    }
                    else {
                        var eq = data[0].left;
                        var def = data[0].right;
                        var itemDef = new models.ItemDef();

                        eq = models.Item._fromDB(eq);
                        def = models.ItemDef._fromDB(def);

                        equipment._initProperties(eq, false);
                        itemDef._initProperties(def, false);

                        resolve([equipment, itemDef]);
                    }
                    adapter.pool.release(client);
                });
            });
        });
    }

    getItemWithPrefixDef(itemId, prefix) {
        return this.getItemWithDef(itemId).then((results) => {
            var itemDef = results[1];
            if (!itemDef || !itemDef.type.startsWith(prefix)) {
                return Promise.reject(Constants.InvalidRequest);
            }
            return results;
        });
    }

    getEquipmentWithDef(equipmentId) {
        return this.getItemWithDef(equipmentId).then((results) => {
            var itemDef = results[1];
            if (!itemDef || !(itemDef.type.startsWith("WE_") || itemDef.type.startsWith("AR_"))) {
                return Promise.reject(Constants.InvalidRequest);
            }
            return results;
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
        .then((results) => {
            var itemGroups = results[0];
            var itemDefs = _.groupBy(results[1], "id");
            var stack = 0;
            for (var i=0;i<itemGroups.length;i++) {
                var itemId = itemGroups[i];
                var stackSize = itemDefs[itemId][0].stackSize;
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
