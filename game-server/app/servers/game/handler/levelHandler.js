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
        var cache = this.app.get("cache");
        level = cache.levelById[level];
        if (!level || !level.enabled) {
            return this.errorNext(Constants.StageFailed.NO_LEVEL, next);
        }

        var seeds = null, self = this;
        this.safe(models.Role.get(session.get("role").id).run().bind(this)
        .then(function (role) {
            var seedGen = this.seedGen;
            var maxCoin = 0, items = {};
            role.fillEnergy(this.app.get("energyTable"));
//            if (role.energy < level.energy) {
//                throw Constants.NO_ENERGY;
//            }
            if (role.level < level.min_level) {
                throw Constants.StageFailed.LevelRequired;
            }
//            role.energy -= level.energy;

            var missingItem;
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
                            if (!cache.getItemDef(itemId)) {
                                missingItem = itemId;
                            }
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
            if (missingItem) {
                return Promise.reject({
                    __sheath__error__: true,
                    code: Constants.InternalServerError,
                    message: "missing item " + missingItem
                });
            }
            role.levelGain = {
                level: level.id,
                exp: level.roleExp || 0,
                hExp: level.heroExp || 0,
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

    addSkillPlus(levelGain, teamHeroes, heroDefById)
    {
        var conf = {
            "10001": {type: "coin", val: 5},
            "10002": {type: "coin", val: 10},
            "10003": {type: "coin", val: 15},
            "10004": {type: "coin", val: 20},
            "10005": {type: "coin", val: 25},
            "10006": {type: "coin", val: 30},
            "10007": {type: "coin", val: 40},

            "10011": {type: "roleExp", val: 5},
            "10012": {type: "roleExp", val: 10},
            "10013": {type: "roleExp", val: 15},
            "10014": {type: "roleExp", val: 20},
            "10015": {type: "roleExp", val: 25},
            "10016": {type: "roleExp", val: 30},
            "10017": {type: "roleExp", val: 40},

            "10241": {type: "heroExp", val: 5},
            "10242": {type: "heroExp", val: 10},
            "10243": {type: "heroExp", val: 15},
            "10244": {type: "heroExp", val: 20},
            "10245": {type: "heroExp", val: 25},
            "10246": {type: "heroExp", val: 30},
            "10247": {type: "heroExp", val: 35}
        };

        var coin = 0, roleExp = 0, heroExp = 0;
        _.forEach(teamHeroes, function(h) {
            var heroDef = heroDefById[h.heroDefId];
            var key = heroDef.pSkill * 10 + h.stars + heroDef.stars;
            var prop = conf[key];

            if(prop) {
                if(prop.type === "coin") {
                    coin += prop.val;
                }
                else if(prop.type === "roleExp") {
                    roleExp += prop.val;
                }
                else {
                    heroExp += prop.val;
                }
            }
        });

        levelGain.maxCoin *= 1 + coin / 100;
        levelGain.exp  *= 1 + roleExp / 100;
        levelGain.hExp *= 1 + heroExp / 100;
    }

    end(msg, session, next) {
        wrapSession(session);

        var level = msg.level, role = session.get("role");
        var cache = this.app.get("cache");
        level = cache.levelById[level];
        if (!level) {
            return this.errorNext(Constants.StageFailed.NO_LEVEL, next);
        }

        var coins = Math.floor(msg.coins) || 0, items = msg.items || {};
        var team = _.compact(role.team);
        var heroExp, roleExp;

        if (!team || team.length === 0) {
            return this.errorNext(Constants.InternalServerError, next);
        }

        this.safe(Promise.join(models.Role.get(role.id).run(), models.Hero.getAll.apply(models.Hero, team).run()).bind(this)
        .spread(function (_role, teamHeroes) {
            role = _role;
            var levelGain = role.levelGain;
            if (!levelGain) {
                throw Constants.InvalidRequest;
            }
            var itemIds = _.keys(items);
            var expTables = this.app.get("expTables");
            for (var i=0;i<itemIds.length;i++) {
                var itemId = itemIds[i];
                if (items[itemId] > (levelGain.items[itemId] || 0)) {
                    models.Role.get(role.id).update({"levelGain": r.literal({})}).run();
                    throw Constants.StageFailed.Invalid_End;
                }
            }

            this.addSkillPlus(levelGain, teamHeroes, cache.heroDefById);
            if (coins > levelGain.maxCoin) {
                models.Role.get(role.id).update({"levelGain": r.literal({})}).run();
                throw Constants.StageFailed.Invalid_End;
            }
            heroExp = levelGain.hExp || 0;
            roleExp = levelGain.exp || 0;
            role.coins += coins || 0;
            role.exp += roleExp;
            role.levelGain = {};
            var lGain = role.levelUp(expTables.role);
            var hUps = _.map(teamHeroes, function (h) {
                h.exp += heroExp;
                var heroDef = cache.heroDefById[h.heroDefId];
                h.levelUp(expTables.hero, heroDef.expFactor, role.level);
                return h.save();
            });
            var newItems = [];
            if (lGain) {
                this.app.rpc.game.taskRemote.notify(session, "Role.LevelUp", role.id, {levelGain: lGain}, null);
            }
            _.each(itemIds, function (itemId) {
                for (var i=0;i<items[itemId];i++) {
                    newItems.push({
                        itemDefId: parseInt(itemId),
                        owner: role.id,
                        bound: null
                    });
                }
            });
            session.set("role", role.toSessionObj());
            return [role.save(), models.Item.save(newItems), hUps, session.push("role")];
        })
        .spread(function (role, newItems) {
            this.app.rpc.game.taskRemote.notify(session, "Level.Cleared", role.id, {level: level.id}, null);
            next(null, {
                level: level.id,
                newItems: _.invoke(newItems, "toClientObj"),
                role: role.toClientObj(),
                heroExp: heroExp,
                roleExp: roleExp
            });
            logger.logInfo("level.end", {
                level: level.id,
                newItems: _.invoke(newItems, "toLogObj"),
                role: role.toLogObj()
            });
        }), next);
    }
}
