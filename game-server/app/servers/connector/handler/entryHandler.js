var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var userDAO = require("../../../../../shared/dao/user");
var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var _ = require("lodash");
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

        if (session.uid) {
            return this.errorNext(Constants.LoginFailed.AlreadyLoggedIn, next);
        }

        var user;
        var device = msg.device;

        this.safe(this.app.rpc.auth.authRemote.authenticateAsync(session, msg.accType, msg.username.toLowerCase(), msg.password).bind(this)
        .then((u) => {
            user = u;
            if (!user) {
                return Promise.reject(Constants.LoginFailed.ID_PASSWORD_MISMATCH);
            }
            var partUCount = this.app.rpc.manager.partitionStatsRemote.getUserCountAsync(session);
            session.set("distro", msg.distro);
            session.set("device", device);
            return [partUCount, session.bind(user.id), session.pushAll()];
        })
        .all().then((results) => {
            var partStats = results[0];
            var partitions = this.app.get("cache").getPartitions();
            session.on('closed', onUserLeave.bind(null, this.app));

            var logType = "user.login";
            if (user.isNew) logType = "user.register";
            logger.logInfo(logType, {
                device: device,
                ip: session.__session__.__socket__.remoteAddress.ip,
                distro: msg.distro,
                accType: msg.accType,
                accId: msg.username,
                user: user.id
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
        }), next);
    }

    enterPartition(msg, session, next) {
        var role;
        var logType = "role.login";
        var part = this.app.get("cache").partitionById[msg.partId];
        var device = session.get("device");

        if (!part) {
            return this.errorNext(Constants.PartitionFailed.PARTITION_DO_NOT_EXIST, next);
        }
        if (part.openSince > Date.now()) {
            return this.errorNext(Constants.PartitionFailed.PARTITION_NOT_OPEN, next);
        }
        if (session.get("role")) {
            return this.errorNext(Constants.LoginFailed.AlreadyLoggedIn, next);
        }

        var newRoleConf = this.app.get("roleBootstrap");
        this.safe(models.Role.findOneP({where: {owner: session.uid, partition: part.id}}).bind(this)
        .then((role) => {
            if (!role) {
                var newData = {
                    partition: part.id,
                    owner: session.uid,
                    name: newRoleConf.name,

                    energy: newRoleConf.energy,
                    coins: newRoleConf.coins,
                    golds: newRoleConf.golds,
                    contribs: newRoleConf.contribs,

                    tutorial: 1
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
                    return role.saveP();
                });
            }
            else {
                role.fillEnergy();
                return role.saveP();
            }
        })
        .then((_role) => {
            role = _role;
            session.set("role", role.toSessionObj());
            session.set("partId", part.id);
            var deviceUpsert = models.Device.upsertP({
                id: device.deviceID,
                os: device.os,
                osVersion: device.osVersion,
                clientVersion: device.clientVersion || "0.1",
                deviceName: device.device,

                lastRole: role.id,
                lastLogin: new Date()
            });
            return Promise.join(session.pushAll(), deviceUpsert);
        })
        .then(() => {
            this.app.rpc.manager.partitionStatsRemote.joinPartition(session, part.id, null);
            this.app.rpc.chat.chatRemote.add(session, session.uid, role.name, this.app.get('serverId'), part.id, null);
            this.app.rpc.chat.announcementRemote.userJoined(session, session.uid, part.id, null);
            next(null, {
                role: role.toClientObj(),
                heroCans: 0 < role.tutorial < 3 ? newRoleConf.initialHeroCandidates : []
            });
            logger.logInfo(logType, {
                user: session.uid,
                role: role.toLogObj(),
                partition: _.pick(part, "id", "name")
            });
        }), next);
    }

    logOff(msg, session, next) {
        onRoleLeave(this.app, session);
        this.safe(session.pushAll().bind(this)
        .then(function () {
            next(null, {ok: true});
        }), next);
    }
}

var onRoleLeave = function (app, session) {
    var role = session.get("role");
    var partId = session.get('partId');
    if (role && partId) {
        app.rpc.chat.chatRemote.kick(session, session.uid, app.get('serverId'), partId, null);
        models.Role.update({where: {id: role.id}, update: {lastLogOff: new Date()}}, function () {});
        logger.logInfo("role.logout", {
            user: session.uid,
            role: _.pick(role, "id", "name", "level", "title", "coins", "golds"),
            partition: role.partition
        });
        session.set("role", null);
        session.set("part", null);
    }
};

var onUserLeave = function (app, session, reason) {
    onRoleLeave(app, session);
    logger.logInfo("user.logout", {
        "user": session.uid
    });
};
