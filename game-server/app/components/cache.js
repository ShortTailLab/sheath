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
        Promise.join(this.loadHeroDef(), this.loadItemDef()).finally(cb);
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
            this.itemComposite = {};
            for (var i=0;i<this.itemDefs.length;i++) {
                var itemDef = this.itemDefs[i];
                var prefix = itemDef.type.substr(0, 3);
                if (prefix === "WE_" || prefix === "AR_") {
                    var key = prefix + itemDef.quality;
                    if (!this.itemComposite[key]) this.itemComposite[key] = [];
                    this.itemComposite[key].push(itemDef);
                }
            }
        })
        .catch(function (err) {
            console.log("error loading item defs. " + err);
        });
    }

    randomCompositeTarget(itemDef) {
        var key = itemDef.type.substr(0, 2) + "_" + itemDef.quality;
        var targets = this.itemComposite[key];
        return targets ? _.sample(targets) : null;
    }
}
