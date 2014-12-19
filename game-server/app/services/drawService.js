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
        var candidate = [];

        for (var i=0;i<10;i++) {
            candidate = utils.sampleWithWeight(heroes, weights, count);
            if (candidate.length === heroes.length || !oldItems || oldItems.length === 0) {
                if(count === 10) {
                    var heroCount = 0;
                    _.forEach(candidate, function(row) {
                        if (!row.isSoul && cache.heroDefById[row.itemId]) {
                            ++heroCount;
                        }
                    });

                    if(heroCount < 2) {
                        var heroArray = [];
                        _.forEach(heroes, function(row) {
                            if (!row.isSoul && cache.heroDefById[row.itemId]) {
                                heroArray.push(row);
                            }
                        });

                        if(heroArray.length > 0) {
                            while(heroCount++ < 2) {
                                var idx = _.random(0, heroArray.length - 1);
                                var removedOne = false;

                                _.remove(candidate, function(row) {
                                    if(!removedOne && (row.isSoul || !cache.heroDefById[row.itemId])) {
                                        removedOne = true;
                                        return true;
                                    }
                                    return false;
                                });

                                candidate.push(heroArray[idx]);
                            }
                        }
                    }
                }

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
