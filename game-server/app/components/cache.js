var Promise = require("bluebird");
var _ = require("underscore");
var models = require("../../../shared/models");

var toMap = function(array, key) {
    var ret = {};
    for (var i=0;i<array.length;i++) {
        var obj = array[i];
        ret[obj[key]] = obj;
    }
    return ret;
};

module.exports = function(app, opts) {
    var cache = new Cache(app, opts);
    app.set("cache", cache);
    return cache;
};

/// In proc data cache.
class Cache {
    constructor(app, opts) {
        this.app = app;
        this.name = "cache";
    }

    start(cb) {
        this.app.registerAdmin(require("./cacheMon"), {app: this.app, cache: this});
        process.nextTick(cb);
    }

    afterStart(cb) {
        Promise.join(this.loadHeroDef(), this.loadItemDef(), this.loadWeaponDef()).finally(cb);
    }

    stop(cb) {
        process.nextTick(cb);
    }

    loadHeroDef() {
        models.HeroDef.allP().bind(this).then(function (hDefs) {
            this.clientHeroDefs = _.invoke(hDefs, "toClientObj");
            this.heroDefs = _.invoke(hDefs, "toObject");
            this.heroDefById = toMap(this.heroDefs, "id");
        })
        .catch(function (err) {
            console.log("error loading item defs. " + err);
        });
    }

    loadItemDef() {
        models.ItemDef.allP().bind(this).then(function (itemDefs) {
            this.clientItemDefs = _.invoke(itemDefs, "toClientObj");
            this.itemDefs = _.invoke(itemDefs, "toObject");
            this.itemDefById = toMap(this.itemDefs, "id");
        })
        .catch(function (err) {
            console.log("error loading item defs. " + err);
        });
    }

    loadWeaponDef() {
        models.EquipmentDef.allP().bind(this).then(function (eqDefs) {
            this.clientEquipmentDefs = _.invoke(eqDefs, "toClientObj");
            this.equipmentDefs = _.invoke(eqDefs, "toObject");
            this.equipmentDefById = toMap(this.equipmentDefs, "id");
        })
        .catch(function (err) {
            console.log("error loading weapon defs. " + err);
        });
    }

    randomCompositeTarget(itemDef) {
        if (itemDef.composeTarget) {
            return _.sample(itemDef.composeTarget);
        }
        return null;
    }
}
