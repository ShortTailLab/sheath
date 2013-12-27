var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var userDAO = require("../../../../../shared/dao/user");
var models = require("../../../../../shared/models");
var Promise = require("bluebird");
var logger;


module.exports = function (app) {
    return new EntryHandler(app);
};

class EntryHandler {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    errorNext(err, next) {
        var result = {error: {code: Constants.UnknownError}};
        if (typeof err === "number")
            result.error.code = err;
        else if (err.__sheath__error__) {}
            result.error.code = err.code;
        if (typeof err.message === "string")
            result.error.message = err.message;
        next(null, result);
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
            var allParts = models.Partition.allP({where: {public: true}});
            var clientUserObj = userDAO.toClientObj(user);
            session.set("user", clientUserObj);
            return [session.bind(user.id), partUCount, allParts, clientUserObj, session.pushAll()];
        })
        .all().spread((_, partStats, partitions, clientUserObj) => {
            session.on('closed', onUserLeave.bind(null, this.app));

            logger.logInfo({
                "type": "user.login",
                "user": user.id
            });

            for (let part of partitions) {
                var partUsers = partStats[part.id] || 0;
                if (partUsers < 500)
                    part.status = 0;
                else if (partUsers < 850)
                    part.status = 1;
                else
                    part.status = 2;
            }
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
            session.set("role", role);
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
    logger.logInfo({
        "type": "user.logout",
        "user": session.uid
    });
};
