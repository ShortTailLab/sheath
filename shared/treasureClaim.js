var r = require("rethinkdb");
var models = require("./models");
var utils = require("./utils");
var _ = require("underscore");
var Promise = require("bluebird");

class TreasureHelper {
    makeClaimPromise(role, treasure) {
        var gain = {};
        return models.Treasure.findP(treasure).bind(this)
        .then(function (treasure) {
            if (!treasure) {
                return {};
            }
            var it = utils.sampleWithWeight(treasure.candidates, treasure.weights);
            var promise = {};
            switch (treasure.type) {
                case "Gold":
                    role.golds += treasure.count;
                    promise = role.saveP();
                    gain.golds = treasure.count;
                    break;
                case "Coin":
                    role.coins += treasure.count;
                    promise = role.saveP();
                    gain.coins = treasure.count;
                    break;
                case "Contrib":
                    role.contribs += treasure.count;
                    promise = role.saveP();
                    gain.contribs = treasure.count;
                    break;
                case "Hero":
                    var hData = _(treasure.count).times(function () { return {owner: role.id, heroDefId: it}; });
                    promise = models.Hero.createP(hData);
                    gain.heroes = 1;
                    break;
                case "Equipment":
                    var itemData = _(treasure.count).times(function () { return {owner: role.id, itemDefId: it}; });
                    promise = models.Item.createP(itemData);
                    gain.items = 1;
                    break;
                case "Piece":
                    break;
            }
            return promise;
        })
        .then(function (entry) {
            if (gain.items) {
                gain.items = _.invoke(entry, "toClientObj");
            }
            else if (gain.heroes) {
                gain.heroes = _.invoke(entry, "toClientObj");
            }
            return gain;
        });
    }

    claim(role, treasure) {
        if (_.isArray(treasure)) {
            return Promise.all(_.map(treasure, this.claim.bind(this, role)))
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
