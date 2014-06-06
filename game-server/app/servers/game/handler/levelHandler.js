var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var seed = require("seed-random");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("lodash");
var r = models.r;
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
        this.safe(models.Role.get(session.get("role").id).run().bind(this)
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
        this.safe(models.Role.get(session.get("role").id).run().bind(this)
        .then(function (role) {
            var seedGen = this.seedGen;
            var maxCoin = 0, items = {};
            role.fillEnergy(this.app.get("energyTable"));
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
                exp: level.exp || 0,
                maxCoin: maxCoin,
                items: items
            };
            return role.save();
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

        var level = msg.level, role;
        level = this.app.get("cache").levelById[level];
        if (!level) {
            return this.errorNext(Constants.StageFailed.NO_LEVEL, next);
        }

        var coins = Math.floor(msg.coins) || 0, items = msg.items || [];
        this.safe(models.Role.get(session.get("role").id).run().bind(this)
        .then(function (_role) {
            role = _role;
            var levelGain = role.levelGain;
            if (!levelGain) {
                return Promise.reject(Constants.InvalidRequest);
            }
            var itemIds = _.keys(items);
            for (var i=0;i<itemIds.length;i++) {
                var itemId = itemIds[i];
                if (items[itemId] > (levelGain.items[itemId] || 0)) {
                    models.Role.get(role.id).update({"levelGain": r.literal({})}).run();
                    return Promise.reject(Constants.StageFailed.Invalid_End);
                }
            }
            if (coins > levelGain.maxCoin) {
                models.Role.get(role.id).update({"levelGain": r.literal({})}).run();
                return Promise.reject(Constants.StageFailed.Invalid_End);
            }
            role.coins += coins;
            role.exp += levelGain.exp;
            role.levelGain = {};
            var lGain = role.levelUp(this.app.get("expTables").role);
            var newItems = [];
            if (lGain) {
                this.app.rpc.game.taskRemote.notify(session, "Role.LevelUp", role.id, {levelGain: lGain}, null);
            }
            _.each(itemIds, function (itemId) {
                for (var i=0;i<items[itemId];i++) {
                    newItems.push((new models.Item({
                        itemDefId: parseInt(itemId),
                        owner: role.id
                    })).save());
                }
            });
            return [role.save(), Promise.all(newItems)];
        })
        .spread(function (role, newItems) {
            this.app.rpc.game.taskRemote.notify(session, "Level.Cleared", role.id, {level: level.id}, null);
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
