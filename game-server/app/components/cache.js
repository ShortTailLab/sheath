var Promise = require("bluebird");
var _ = require("lodash");
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
        this.cacheRole = opts.role;
    }

    start(cb) {
        this.app.registerAdmin(require("./cacheMon"), {app: this.app, cache: this});
        process.nextTick(cb);
    }

    afterStart(cb) {
        if (this.cacheRole === "game") {
            Promise.join(this.loadHeroDef(), this.loadItemDef(), this.loadEquipmentDef(), this.loadLevel(),
                this.loadStoreItem(), this.loadHeroDraws()).finally(cb);
        }
        else if (this.cacheRole === "connector") {
            Promise.join(this.loadPartition()).finally(cb);
        }
        else {
            process.nextTick(cb);
        }
    }

    stop(cb) {
        process.nextTick(cb);
    }

    loadPartition() {
        return models.Partition.allP({order: "openSince"}).bind(this).then(function (partitions) {
            this.clientPartitions = _.invoke(partitions, "toClientObj");
            this.partitionById = toMap(this.clientPartitions, "id");
            this.partTimeIndex = 0;
        })
        .catch(function (err) {
            console.log("error loading partitions. " + err);
        });
    }

    loadHeroDef() {
        return models.HeroDef.allP().bind(this).then(function (hDefs) {
            this.clientHeroDefs = _.invoke(hDefs, "toClientObj");
            this.heroDefs = _.invoke(hDefs, "toObject");
            this.heroDefById = toMap(this.heroDefs, "id");
        })
        .catch(function (err) {
            console.log("error loading hero defs. " + err);
        });
    }

    loadItemDef() {
        return models.ItemDef.allP().bind(this).then(function (itemDefs) {
            this.clientItemDefs = _.invoke(itemDefs, "toClientObj");
            this.itemDefs = _.invoke(itemDefs, "toObject");
            this.itemDefById = toMap(this.itemDefs, "id");
        })
        .catch(function (err) {
            console.log("error loading item defs. " + err);
        });
    }

    loadEquipmentDef() {
        return models.EquipmentDef.allP().bind(this).then(function (eqDefs) {
            this.clientEquipmentDefs = _.invoke(eqDefs, "toClientObj");
            this.equipmentDefs = _.invoke(eqDefs, "toObject");
            this.equipmentDefById = toMap(this.equipmentDefs, "id");
        })
        .catch(function (err) {
            console.log("error loading equipment defs. " + err);
        });
    }

    loadLevel() {
        return models.Level.allP({order: "id"}).bind(this).then(function (levels) {
            this.clientLevels = _.sortBy(_.map(_.groupBy(levels, "stageId"), function (slevels) {
                return {
                    stageId: slevels[0].stageId,
                    stage: slevels[0].stage,
                    levels: _.invoke(slevels, "toClientObj")
                };
            }), "stageId");
            this.levels = _.invoke(levels, "toObject");
            this.levelById = toMap(this.levels, "id");
        })
        .catch(function (err) {
            console.log("error loading levels. " + err);
        });
    }

    partition(array, predicate) {
        var pass = [], fail = [];
        _.each(array, function(elem) {
            (predicate(elem) ? pass : fail).push(elem);
        });
        return [pass, fail];
    }

    loadStoreItem() {
        return models.StoreItem.allP().bind(this).then(function (items) {
            items = _.invoke(items, "toObject");
            var sitems = this.partition(items, function (it) { return it.gold; });
            this.storeItemG = sitems[0];
            this.storeItemC = sitems[1];
            this.storeItemById = toMap(items, "id");
        })
        .catch(function (err) {
            console.log("error loading StoreItems. " + err);
        });
    }

    loadHeroDraws() {
        return Promise.join(models.HeroDraw.allP(), models.HeroNode.allP()).bind(this)
        .spread(function (draws, nodes) {
            this.heroDraws = _.invoke(draws, "toObject");
            this.heroNodes = _.invoke(_.sortBy(nodes, "weight"), "toObject");
            this.heroDrawById = toMap(this.heroDraws, "id");
        })
        .catch(function (err) {
            console.log("error loading HeroNode. " + err);
        });
    }

    getPartitions() {
        var now = Date.now();
        for (;this.partTimeIndex<this.clientPartitions.length;++this.partTimeIndex) {
            if (this.clientPartitions[this.partTimeIndex].openSince > now) {
                break;
            }
        }
        return this.clientPartitions.slice(0, this.partTimeIndex);
    }

    randomCompositeTarget(itemDef) {
        if (itemDef && itemDef.composable && itemDef.composeTarget) {
            return _.sample(itemDef.composeTarget);
        }
        return null;
    }

    getPieceId(itemDef) {
    }

    getItemDef(itemId) {
        return this.itemDefById[itemId] || this.equipmentDefById[itemId];
    }
}
