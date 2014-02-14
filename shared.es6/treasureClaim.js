var r = require("rethinkdb");
var models = require("./models");
var constants = require("./constants");
var _ = require("underscore");
var Promise = require("bluebird");

class TreasureHelper {
    getIndexInWeights(weights) {
        var maxWeight = weights[weights.length - 1];
        var w = Math.random() * maxWeight;
        return _.sortedIndex(weights, w);
    }

    sampleWithWeight(list, weights, count=1, distinct=false) {
        if (list.length <= count) {
            return list;
        }
        var cumDist = _.clone(weights);
        for (var i=1;i<weights.length;i++) {
            cumDist[i] += cumDist[i-1];
        }
        if (count === 1) {
            return list[this.getIndexInWeights(cumDist)];
        }
        else {
            var ret = [];
            while (ret.length < count) {
                for (var it=ret.length;it<count;it++) {
                    ret.push(this.getIndexInWeights(cumDist));
                }
                if (distinct) {
                    ret = _.uniq(ret);
                }
            }
            for (var j=0;j<ret.length;j++) {
                ret[j] = list[ret[j]];
            }
            return ret;
        }
    }

    makeClaimPromise(role, treasure) {
        var it = this.sampleWithWeight(treasure.candidates, treasure.weights);
        var promise, gain;
        switch (treasure.type) {
            case "Gold":
                role.golds += treasure.count;
                promise = role;
                gain = {coins: treasure.count};
                break;
            case "Coin":
                role.coins += treasure.count;
                promise = role;
                gain = {coins: treasure.count};
                break;
            case "Contrib":
                role.contribs += treasure.count;
                promise = role;
                gain = {contribs: treasure.count};
                break;
            case "Hero":
                var hData = _(treasure.count).times(function () { return {owner: role.id, heroDefId: it}; });
                promise = models.Hero.createP(hData);
                gain = {heroes: 1};
                break;
            case "Equipment":
                var itemData = _(treasure.count).times(function () { return {owner: role.id, itemDefId: it}; });
                promise = models.Item.createP(itemData);
                gain = {items: 1};
                break;
            case "Piece":
                break;
        }
        if (promise) {
            return promise.then(function (entry) {
                if (gain.items) {
                    gain.items = _.invoke(entry, "toClientObj");
                }
                else if (gain.heroes) {
                    gain.heroes = _.invoke(entry, "toClientObj");
                }
                return gain;
            });
        }
        else {
            return {};
        }
    }

    claim(role, treasure) {
        if (_.isArray(treasure)) {
            return Promise.all(_.map(treasure, this.claimTreasure.bind(this)))
            .then(function (gains) {
                return _.reduce(gains, function (a, b) {
                    return {
                        golds: (a.golds || 0) + (b.golds || 0),
                        coins: (a.coins || 0) + (b.coins || 0),
                        contribs: (a.contribs || 0) + (b.contribs || 0),
                        heroes: (a.heroes || []).concat((b.heroes || [])),
                        items: (a.items || []).concat((b.items || []))
                    };
                }, {});
            });
        }
        else {
            return this.makeClaimPromise(role, treasure);
        }
    }
}

module.exports = new TreasureHelper();
