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
            var clientUserObj = userDAO.toClientObj(user);
            session.set("user", clientUserObj);
            return [session.bind(user.id), partUCount, allParts, clientUserObj, session.pushAll()];
        })
        .all().spread((__, partStats, partitions, clientUserObj) => {
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
                user: clientUserObj,
                partitions: partitions
            });
        })
        .catch((err) => {
            this.errorNext(err, next);
        });
    }

    enterPartition(msg, session, next) {
        var part;
        models.Partition.findP(msg.partId).bind(this)
        .then((p) => {
            part = p;
            if (!part) {
                return Promise.reject(Constants.PartitionFailed.PARTITION_DO_NOT_EXIST);
            }
            else {
                return this.app.rpc.manager.partitionStatsRemote.joinPartitionAsync(session, part.id);
            }
        })
        .then(() => {
            return models.Role.findOrCreateP({where: {owner: session.uid, partition: part.id}}, {isNew: true});
        })
        .then((role) => {
            var promises = [role, null, null];
            if (!role.isNew) {
                promises[1] = this.app.rpc.chat.chatRemote.addP(session, session.uid, role.name, this.app.get('serverId'), part.id);
            }
            session.set("role", role.toObject(true));
            session.set("partId", part.id);
            promises[2] = session.pushAll();
            return promises;
        })
        .all().spread((role) => {
            next(null, {
                role: userDAO.toClientRole(role)
            });
        })
        .catch((err) => {
            this.errorNext(err, next);
        });
    }

    // handler calls for initial role setup
}

var onUserLeave = function (app, session, reason) {
    var partId = session.get('partId');
    if (typeof partId === "string") {
        app.rpc.manager.partitionStatsRemote.leavePartition(partId, null);
        var role = session.get("role");
        if (role) {
            app.rpc.chat.chatRemote.kick(session, session.uid, role.name, app.get('serverId'), partId, null);
        }
    }
    logger.logInfo("user.logout", {
        "user": session.uid
    });
};
