var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var userDAO = require("../../../../../shared/dao/user");
var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var _ = require("underscore");
var Promise = require("bluebird");
var logger;


module.exports = function (app) {
    return new EntryHandler(app);
};

class EntryHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    enter(msg, session, next) {
        wrapSession(session);

        var user;
        this.app.rpc.auth.authRemote.authenticateAsync(session, msg.accType, msg.username.toLowerCase(), msg.password).bind(this)
        .then((u) => {
            user = u;
            if (!user) {
                return Promise.reject(Constants.LoginFailed.ID_PASSWORD_MISMATCH);
            }
            if (session.uid) {
                if (session.uid === user.id) {
                    session.unbind(user.id);
                }
                else {
                    return this.app.get('sessionService').kick(user.id);
                }
            }
        })
        .then(() => {
            var partUCount = this.app.rpc.manager.partitionStatsRemote.getUserCountAsync(session);
            var allParts = models.Partition.allP({where: {public: true}, order: "openSince DESC"});
            session.set("userId", user.id);
            return [session.bind(user.id), partUCount, allParts, session.pushAll()];
        })
        .spread((__, partStats, partitions) => {
            session.on('closed', onUserLeave.bind(null, this.app));

            var logType = "user.login";
            if (user.isNew) logType = "user.register";
            logger.logInfo(logType, {
                "user": user.id
            });

            partitions = _.map(partitions, function (p) {
                var ret = {
                    id: p.id,
                    name: p.name,
                    openSince: +p.openSince
                };
                var partUsers = partStats[p.id] || 0;
                if (partUsers < 500)
                    ret.status = 0;
                else if (partUsers < 850)
                    ret.status = 1;
                else
                    ret.status = 2;

                return ret;
            });

            next(null, {
                user: {id: user.id},
                partitions: partitions
            });
        })
        .catch((err) => {
            this.errorNext(err, next);
        });
    }

    enterPartition(msg, session, next) {
        var part, role;
        var logType = "role.login";

        this.safe(models.Partition.findP(msg.partId).bind(this)
        .then((p) => {
            part = p;
            if (!part) {
                return Promise.reject(Constants.PartitionFailed.PARTITION_DO_NOT_EXIST);
            }
            else if (part.openSince > new Date()) {
                return Promise.reject(Constants.PartitionFailed.PARTITION_NOT_OPEN);
            }
            else {
                return [models.Role.findOneP({where: {owner: session.uid, partition: part.id}}),
                    this.app.rpc.manager.partitionStatsRemote.joinPartitionAsync(session, part.id)];
            }
        })
        .spread((role) => {
            if (!role) {
                var newRoleConf = this.app.get("dataService").get("roleBootstrap").data;
                var newData = {
                    partition: part.id,
                    owner: session.uid,
                    name: newRoleConf.name.value,

                    energy: parseInt(newRoleConf.energy.value),
                    coins: parseInt(newRoleConf.coins.value),
                    golds: parseInt(newRoleConf.golds.value),
                    contribs: parseInt(newRoleConf.contribs.value),

                    isNew: true
                };
                logType = "role.register";

                return models.Role.createP(newData).then((role) => {
                    var initialHeroes = JSON.parse(newRoleConf.heroes.value);
                    var initialItems = JSON.parse(newRoleConf.items.value);
                    var heros = _.map(initialHeroes, function (hid) {
                        return {
                            heroDefId: hid,
                            owner: role.id
                        };
                    });
                    var items = _.map(initialItems, function (itemId) {
                        return {
                            itemDefId: itemId,
                            owner: role.id
                        };
                    });

                    return [role, models.Hero.createP(heros), models.Item.createP(items)];
                });
            }
            else {
                role.fillEnergy();
                return [role.saveP()];
            }
        })
        .spread((_role) => {
            role = _role;
            session.set("role", role.toSessionObj());
            session.set("partId", part.id);
            return session.pushAll();
        })
        .then(() => {
            this.app.rpc.chat.chatRemote.add(session, session.uid, role.name, this.app.get('serverId'), part.id, null);
            next(null, {
                role: role.toClientObj()
            });
            logger.logInfo(logType, {
                user: session.uid,
                role: role.toLogObj(),
                partition: part.toLogObj()
            });
        }), next);
    }
}

var onUserLeave = function (app, session, reason) {
    var partId = session.get('partId');
    if (typeof partId === "string") {
        app.rpc.manager.partitionStatsRemote.leavePartition(session, partId, null);
        var role = session.get("role");
        if (role) {
            app.rpc.chat.chatRemote.kick(session, session.uid, app.get('serverId'), partId, null);
            logger.logInfo("role.logout", {
                user: session.uid,
                role: _.pick(role, "id", "name", "level", "title", "coins", "golds"),
                partition: role.partition
            });
        }
    }
    logger.logInfo("user.logout", {
        "user": session.uid
    });
};
