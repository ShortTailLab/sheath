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
            return [partUCount, session.bind(user.id)];
        })
        .all().then((results) => {
            var partStats = results[0];
            var partitions = this.app.get("cache").getPartitions();
            session.on('closed', onUserLeave.bind(null, this.app));

            var logType = "user.login";
            if (user.isNew) logType = "user.register";
            logger.logInfo(logType, {
                "user": user.id
            });

            for (var i=0;i<partitions.length;i++) {
                var p = partitions[i];
                var partUsers = partStats[p.id] || 0;
                if (partUsers < 500)
                    p.status = 0;
                else if (partUsers < 850)
                    p.status = 1;
                else
                    p.status = 2;
            }

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
        var role;
        var logType = "role.login";
        var part = this.app.get("cache").partitionById[msg.partId];

        if (!part) {
            return this.errorNext(Constants.PartitionFailed.PARTITION_DO_NOT_EXIST, next);
        }
        if (part.openSince > Date.now()) {
            return this.errorNext(Constants.PartitionFailed.PARTITION_NOT_OPEN, next);
        }

        this.safe(models.Role.findOneP({where: {owner: session.uid, partition: part.id}}).bind(this)
        .then((role) => {
            if (!role) {
                var newRoleConf = this.app.get("roleBootstrap");
                var newData = {
                    partition: part.id,
                    owner: session.uid,
                    name: newRoleConf.name,

                    energy: newRoleConf.energy,
                    coins: newRoleConf.coins,
                    golds: newRoleConf.golds,
                    contribs: newRoleConf.contribs,

                    isNew: true
                };
                logType = "role.register";

                return models.Role.createP(newData).then((role) => {
                    var initialHeroes = newRoleConf.heroes;
                    var initialItems = newRoleConf.items;
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
                })
                .spread(function (role, heroes) {
                    role.setTeam(0, _.pluck(heroes, "id"));
                    return [role.saveP()];
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
            this.app.rpc.manager.partitionStatsRemote.joinPartition(session, part.id, null);
            this.app.rpc.chat.chatRemote.add(session, session.uid, role.name, this.app.get('serverId'), part.id, null);
            this.app.rpc.chat.announcementRemote.userJoined(session, session.uid, part.id, null);
            next(null, {
                role: role.toClientObj()
            });
            logger.logInfo(logType, {
                user: session.uid,
                role: role.toLogObj(),
                partition: _.pick(part, "id", "name")
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
            models.Role.update({where: {id: role.id}, update: {lastLogOff: new Date()}}, function () {});
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
