var utils = require("../../../shared/utils");
var _ = require("lodash");

class BarService
{
    constructor() {
        this.app = null;
        this.nextRefresh = null;
        this.heroes = null;
    }

    initOnce(app) {
        if (utils.initOnce("barService")) {
            this.app = app;
            this.systemRefresh();
        }
    }

    sample(weightKey, oldItems=null) {
        var heroes = this.app.get("cache").heroDraws;
        var weights = _.pluck(heroes, weightKey);
        var candidate = [];

        for (var i=0;i<10;i++) {
            candidate = utils.sampleWithWeight(heroes, weights, 3, true);
            if (candidate.length === heroes.length || !oldItems) {
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

    listHeroes() {
        if (this.nextRefresh * 1000 <= Date.now()) {
            this.systemRefresh();
        }
        return this.heroes;
    }

    systemRefresh() {
        this.heroes = this.sample("sysWeight", this.heroes);
        this.nextRefresh = utils.nextTimeSegment(2);
    }

    getFreeRefresh(role) {
        var roleOldHeroes = role.bar.heroes ? role.bar.heroes : this.heroes;
        var stock = this.sample("freeWeight", roleOldHeroes);
        this.applyNode(role, stock);
        return stock;
    }

    getPaidRefresh(role) {
        var roleOldHeroes = role.bar.heroes ? role.bar.heroes : this.heroes;
        var stock = this.sample("paidWeight", roleOldHeroes);
        this.applyNode(role, stock);
        return stock;
    }

    applyNode(role, stock) {
        var nodes = this.app.get("cache").heroNodes;
        for (var i=nodes.length-1;i>=0;i--) {
            var node = nodes[i];
        }
    }
}

module.exports = new BarService();
