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
        var cache = this.app.get("cache");
        var heroes = cache.heroDraws;
        var weights = _.pluck(heroes, weightKey);
        var candidate;

        if(count === 10) {
            candidate = utils.sampleLimit(heroes, weights, 2, 4, function(row) {
                return !row.isSoul && cache.heroDefById[row.itemId];
            }, count);
        }
        else {
            candidate = utils.sampleWithWeight(heroes, weights, count);
        }

        return candidate;
    }

    pickWeightKey(coinDraw, tenDraw, freeDraw) {
        var hash = (tenDraw << 2) + (freeDraw << 1) + coinDraw ;
        var keyMap = [
            "paidGoldWeight", "paidCoinWeight",
            "goldWeight", "coinWeight",
            "tenGoldWeight"
        ];
        return keyMap[hash];
    }

    materializeDrawResult(owner, results) {
        var cache = this.app.get("cache");
        var ret = {heroes: [], items: [], souls: {}};
        for (var i=0;i<results.length;i++) {
            var item = results[i];
            if (item.isSoul) {
                var itemId = item.itemId;
                ret.souls[itemId] = item.count;
                owner.souls[itemId] = (owner.souls[itemId] || 0) + item.count;
            }
            else if (cache.heroDefById[item.itemId]) {
                for (var j=0;j<item.count;j++) {
                    ret.heroes.push({
                        heroDefId: item.itemId,
                        owner: owner.id,
                        level: item.level
                    });
                }
            }
            else {
                for (var j=0;j<item.count;j++) {
                    ret.items.push({
                        itemDefId: item.itemId,
                        owner: owner.id,
                        level: item.level,
                        bound: null
                    });
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
