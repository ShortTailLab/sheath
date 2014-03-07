var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var seed = require("seed-random");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
var r = require("rethinkdb");
var logger;


module.exports = function (app) {
    return new LevelHandler(app);
};

class LevelHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        this.seedGen = seed();
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    list(msg, session, next) {
        wrapSession(session);

        var levels = this.app.get("cache").clientLevels;
        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
            var cleared = role.levelCleared;
            _.each(levels, function (stage) {
                _.each(stage.levels, function (l) {
                    l.stars = cleared["" + l.id] || 0;
                });
            });

            next(null, {
                stages: levels
            });
        }), next);
    }

    start(msg, session, next) {
        wrapSession(session);

        var level = msg.level;
        level = this.app.get("cache").levelById[level];
        if (!level) {
            return this.errorNext(Constants.StageFailed.NO_LEVEL, next);
        }

        var seeds = null, self = this;
        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
            var seedGen = this.seedGen;
            var maxCoin = 0, items = {};
            role.fillEnergy();
            if (role.energy < level.energy) {
                return Promise.reject(Constants.NO_ENERGY);
            }
            role.energy -= level.energy;

            seeds = _.compact(_.map(level.enemies, function (e) {
                if (e.count === 0) return null;
                if ((e.coins && e.coins.length) || (e.items && e.items.length)) {
                    var seedNum = Math.floor(seedGen() * 65536 * 16);
                    var seedRand = seed(seedNum);
                    for (var i=0;i<e.count;i++) {
                        if (e.coins && e.coins.length) {
                            maxCoin += self.evalRandAtom(e.coins, seedRand) || 0;
                        }
                        if (e.items && e.items.length) {
                            var itemId = self.evalRandAtom(e.items, seedRand);
                            if (itemId) {
                                items[itemId] = (items[itemId] || 0) + 1;
                            }
                        }
                    }
                    return {
                        type: e.type,
                        seed: seedNum
                    };
                }
                return null;
            }));
            role.levelGain = {
                level: level.id,
                maxCoin: maxCoin,
                items: items
            };
            return role.saveP();
        })
        .then(function (role) {
            next(null, {
                enemies: seeds
            });
            logger.logInfo("level.start", {
                level: level.id,
                role: role.toLogObj()
            });
        }), next);
    }

    end(msg, session, next) {
        wrapSession(session);

        var level = msg.level;
        level = this.app.get("cache").levelById[level];
        if (!level) {
            return this.errorNext(Constants.StageFailed.NO_LEVEL, next);
        }

        var coins = Math.floor(msg.coins) || 0, items = msg.items || [];
        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
            var levelGain = role.levelGain;
            if (!levelGain) {
                return Promise.reject(Constants.InvalidRequest);
            }
            var itemIds = _.keys(items);
            for (var i=0;i<itemIds.length;i++) {
                var itemId = itemIds[i];
                if (items[itemId] > (levelGain.items[itemId] || 0)) {
                    role.updateAttribute("levelGain", r.literal({}));
                    return Promise.reject(Constants.StageFailed.Invalid_End);
                }
            }
            if (coins > levelGain.maxCoin) {
                role.updateAttribute("levelGain", r.literal({}));
                return Promise.reject(Constants.StageFailed.Invalid_End);
            }
            role.coins += coins;
            role.levelGain = {};
            var newItems = [];
            _.each(itemIds, function (itemId) {
                for (var i=0;i<items[itemId];i++) {
                    newItems.push({
                        itemDefId: parseInt(itemId),
                        owner: role.id
                    });
                }
            });
            return [role.saveP(), models.Item.createP(newItems)];
        })
        .spread(function (role, newItems) {
            next(null, {
                level: level.id,
                newItems: _.invoke(newItems, "toClientObj"),
                role: role.toClientObj()
            });
            logger.logInfo("level.end", {
                level: level.id,
                newItems: _.invoke(newItems, "toLogObj"),
                role: role.toLogObj()
            });
        }), next);
    }
}
