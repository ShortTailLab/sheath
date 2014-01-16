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
        this.app.rpc.auth.authRemote.authenticateAsync(session, msg.accType, msg.username, msg.password).bind(this)
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
        .all().spread((__, partStats, partitions) => {
            session.on('closed', onUserLeave.bind(null, this.app));

            logger.logInfo("user.login", {
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
        var part;
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
        .all().spread((role) => {
            if (!role) {
                var newRoleConf = this.app.get("dataService").get("roleBootstrap").data;
                var newData = {
                    partition: part.id,
                    owner: session.uid,

                    energy: parseInt(newRoleConf.energy.value),
                    coins: parseInt(newRoleConf.coins.value),
                    golds: parseInt(newRoleConf.golds.value),
                    contribs: parseInt(newRoleConf.contribs.value),

                    isNew: true
                };

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
        .all().spread((role) => {
            var promises = [role, null, null];
            if (!role.isNew) {
                promises[1] = this.app.rpc.chat.chatRemote.addP(session, session.uid, role.name, this.app.get('serverId'), part.id);
            }
            session.set("role", role.toSessionObj());
            session.set("partId", part.id);
            promises[2] = session.pushAll();
            return promises;
        })
        .all().spread((role) => {
            next(null, {
                role: role.toClientObj()
            });
            logger.logInfo("user.enterPartition", {
                user: session.uid,
                role: role.toLogObj(),
                partition: part.toLogObj()
            });
        }), next);
    }

    // handler calls for initial role setup
}

var onUserLeave = function (app, session, reason) {
    var partId = session.get('partId');
    if (typeof partId === "string") {
        app.rpc.manager.partitionStatsRemote.leavePartition(session, partId, null);
        var role = session.get("role");
        if (role) {
            app.rpc.chat.chatRemote.kick(session, session.uid, role.name, app.get('serverId'), partId, null);
        }
    }
    logger.logInfo("user.logout", {
        "user": session.uid
    });
};
