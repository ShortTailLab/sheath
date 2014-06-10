var utils = require("../../../shared/utils");
var _ = require("lodash");
var models = require("../../../shared/models");

class DrawService
{
    constructor() {
        this.app = null;
        this.heroes = null;
    }

    initOnce(app) {
        if (utils.initOnce("drawService")) {
            this.app = app;
        }
    }

    sample(weightKey, count, oldItems=null) {
        if (count === 0) return [];

        var heroes = this.app.get("cache").heroDraws;
        var weights = _.pluck(heroes, weightKey);
        var candidate = [];

        for (var i=0;i<10;i++) {
            candidate = utils.sampleWithWeight(heroes, weights, count, true);
            if (candidate.length === heroes.length || !oldItems || oldItems.length === 0) {
                return candidate;
            }
            else {
                var oldIds = _.pluck(oldItems, "id");
                var newIds = _.pluck(candidate, "itemId");
                if (_.difference(newIds, oldIds).length > 0) {
                    return candidate;
                }
            }
        }
        return candidate;
    }

    pickWeightKey(coinDraw, tenDraw, freeDraw) {
        var hash = (tenDraw << 2) + (freeDraw << 1) + coinDraw ;
        var keyMap = [
            "paidGoldWeight", "paidCoinWeight",
            "goldWeight", "coinWeight",
            "tenGoldWeight", "tenCoinWeight",
            "tenGoldWeight", "tenCoinWeight",
        ];
        return keyMap[hash];
    }

    materializeDrawResult(owner, results) {
        var cache = this.app.get("cache");
        var ret = {heroes: [], items: [], souls: {}};
        for (var i=0;i<results.length;i++) {
            var item = results[i];
            if (item.isSoul) {
                var strItemId = "" + item.itemId;
                ret.souls[strItemId] = item.count;
                owner.souls[strItemId] = (owner.souls[strItemId] || 0) + item.level;
            }
            else if (cache.heroDefById[item.itemId]) {
                for (var j=0;j<item.count;j++) {
                    ret.heroes.push(new models.Hero({
                        heroDefId: item.itemId,
                        owner: owner.id,
                        level: item.level
                    }));
                }
            }
            else {
                for (var j=0;j<item.count;j++) {
                    ret.items.push(new models.Item({
                        itemDefId: item.itemId,
                        owner: owner.id,
                        level: item.level
                    }));
                }
            }
        }
        return ret;
    }

    drawWithCoins(role, tenDraw, freeDraw) {
        var isFirstDraw = role.manualRefreshData[this.app.mKey.firstCoinDraw] || false;
        var weightKey = this.pickWeightKey(true, tenDraw, freeDraw);

        var nodeItems = this.applyNode(role, true, tenDraw, freeDraw);
        var drawItems = this.sample(weightKey, (tenDraw ? 10 : 1) - nodeItems.length, nodeItems);
        return this.materializeDrawResult(role, nodeItems.concat(drawItems));
    }

    drawWithGolds(role, tenDraw, freeDraw) {
        var isFirstDraw = role.manualRefreshData[this.app.mKey.firstGoldDraw] || false;
        var weightKey = this.pickWeightKey(false, tenDraw, freeDraw);

        var nodeItems = this.applyNode(role, false, tenDraw, freeDraw);
        var drawItems = this.sample(weightKey, (tenDraw ? 10 : 1) - nodeItems.length, nodeItems);
        return this.materializeDrawResult(role, nodeItems.concat(drawItems));
    }

    applyNode(role, coinDraw, tenDraw, freeDraw) {
        return [];
    }
}

module.exports = new DrawService();
