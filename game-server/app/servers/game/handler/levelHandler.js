var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var seed = require("seed-random");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
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

        next(null, {
            levels: this.app.get("cache").clientLevels
        });
    }

    start(msg, session, next) {
        wrapSession(session);

        var level = msg.level;
        level = this.app.get("cache").levelById[level];
        if (!level) {
            return this.errorNext(Constants.StageFailed.NO_LEVEL, next);
        }

        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
            var seedGen = this.seedGen;
            var seeds = _.map(level.enemies, function (e) {
                return {
                    coinSeed: Math.floor(seedGen() * 65536 * 16),
                    itemSeed: Math.floor(seedGen() * 65536 * 16),
                    type: e.type
                };
            });
            role.levelGain = {
                level: level.id,
                seeds: seeds
            };
            return role.saveP();
        })
        .then(function (role) {
            next(null, {
                path: level.path,
                enemies: role.levelGain.seeds
            });
            logger.logInfo("level.start", {
                level: level.id,
                role: role.toLogObj()
            });
        }), next);
    }

    end(msg, session, next) {
        wrapSession(session);
    }
}
