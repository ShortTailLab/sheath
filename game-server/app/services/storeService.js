var utils = require("../../../shared/utils");
var _ = require("lodash");

class StoreService
{
    constructor() {
        this.app = null;

        this.goldStore = null;
        this.coinStore = null;

        this.goldRefresh = null;
        this.coinRefresh = null;
    }

    initOnce(app) {
        if (utils.initOnce("storeService")) {
            this.app = app;
            this.refresh6();
            this.refresh8();
        }
    }

    sampleItems(isGold, oldItems=null) {
        var cache = this.app.get("cache");
        var pool = isGold ? cache.storeItemG : cache.storeItemC;
        var candidate = [];

        for (var i=0;i<10;i++) {
            candidate = _.sample(pool, 12);
            if (candidate.length === pool.length || !oldItems) {
                return candidate;
            }
            else {
                var oldIds = _.pluck(oldItems, "id");
                var newIds = _.pluck(candidate, "id");
                if (_.difference(newIds, oldIds).length > 0) {
                    return candidate;
                }
            }
        }
        return candidate;
    }

    refresh6() {
        this.coinStore = this.sampleItems(false, this.coinStore);
        this.coinRefresh = utils.nextTimeSegment(6);
    }

    refresh8() {
        this.goldStore = this.sampleItems(true, this.goldStore);
        this.goldRefresh = utils.nextTimeSegment(8);
    }

    listGoldItems() {
        if (this.goldRefresh * 1000 <= Date.now()) {
            this.refresh8();
        }
        return this.goldStore;
    }

    listCoinItems() {
        if (this.coinRefresh * 1000 <= Date.now()) {
            this.refresh6();
        }
        return this.coinStore;
    }
}

module.exports = new StoreService();
