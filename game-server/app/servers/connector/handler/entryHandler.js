var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var userDAO = require("../../../../../shared/dao/user");
var models = require("../../../../../shared/models");
var r = models.r;
var base = require("../../../../../shared/base");
var _ = require("lodash");
var Promise = require("bluebird");
var moment = require("moment");
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
                throw Constants.LoginFailed.ID_PASSWORD_MISMATCH;
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

            var logType = user.isNew ? "user.register" : "user.login";
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
        var cache = this.app.get("cache");
        var part = cache.partitionById[msg.partId];
        var device = session.get("device");
        var bag, heroes, levels;

        if (!part) {
            return this.errorNext(Constants.PartitionFailed.PARTITION_DO_NOT_EXIST, next);
        }
        if (part.openSince > Date.now()) {
            return this.errorNext(Constants.PartitionFailed.PARTITION_NOT_OPEN, next);
        }
        if (!session.uid) {
            return this.errorNext(Constants.LoginFailed.InvalidRequest, next);
        }
        if (session.get("role")) {
            return this.errorNext(Constants.LoginFailed.AlreadyLoggedIn, next);
        }

        var newRoleConf = this.app.get("roleBootstrap");
        this.safe(models.Role.getAll(session.uid, {index: "owner"}).filter({"partition": part.id}).getJoin({bag: true, heroes: true}).limit(1).run().bind(this)
        .then((roles) => {
            var role = _.first(roles);
            if (!role) {
                var newData = {
                    partition: part.id,
                    owner: session.uid,
                    name: newRoleConf.name,

                    energy: newRoleConf.energy,
                    coins: newRoleConf.coins,
                    golds: newRoleConf.golds,
                    contribs: newRoleConf.contribs,

                    manualRefreshData: {gdr: new Date(), fcd: true, fgd: true},

                    tutorial: 1
                };
                logType = "role.register";

                return new models.Role(newData).save().then((role) => {
                    var initialHeroes = newRoleConf.heroes;
                    var initialItems = newRoleConf.items;
                    var heros = _.map(initialHeroes, function (hid) {
                        return {
                            heroDefId: hid,
                            owner: role.id,
                            level: 10
                        };
                    });
                    var items = _.map(initialItems, function (itemId) {
                        return {
                            itemDefId: itemId,
                            owner: role.id,
                            bound: null
                        };
                    });

                    return [role, models.Hero.save(heros), models.Item.save(items)];
                })
                .spread(function (role, _heroes, _items) {
                    heroes = _heroes;
                    bag = _items;
                    role.team = _.pluck(heroes, "id");
                    return role;
                });
            }
            else {
                bag = role.bag;
                heroes = role.heroes;
                role.fillEnergy(cache.roleByLevel);
                return role;
            }
        })
        .then((_role) => {
            role = _role;
            session.set("role", role.toSessionObj());
            session.set("partId", part.id);
            var deviceUpsert = models.Device.insert({
                id: device.deviceID,
                os: device.os,
                osVersion: device.osVersion,
                clientVersion: device.clientVersion || "0.1",
                deviceName: device.device,

                lastRole: role.id,
                lastLogin: new Date()
            }, {conflict: 'replace'}).execute({durability: "soft"});
            var pendings = [role.save(), session.pushAll(), deviceUpsert];

            this.app.rpc.manager.partitionStatsRemote.joinPartition(session, part.id, null);
            this.app.rpc.chat.chatRemote.add(session, session.uid, role.name, this.app.get('serverId'), part.id, null);
            this.app.rpc.chat.announcementRemote.userJoined(session, session.uid, part.id, null);

            levels = _.cloneDeep(cache.clientLevels);
            var cleared = role.levelCleared;
            _.each(levels, function (stage) {
                _.each(stage.levels, function (l) {
                    l.stars = cleared[l.id] || 0;
                });
            });

            return pendings;
        })
        .all().then(() => {
            next(null, {
                role: role.toClientObj(),
                //heroCans: 0 < role.tutorial < 3 ? newRoleConf.initialHeroCandidates : [],

                heroDefs: cache.clientHeroDefs,
                itemDefs: cache.clientItemDefs,
                equipmentDefs: cache.clientEquipmentDefs,

                items: _.invoke(bag, "toClientObj"),
                heroes: _.invoke(heroes, "toClientObj"),

                stages: levels,

                nextGoldReset: Math.floor(moment(role.manualRefreshData[this.app.mKey.goldDrawReset] || undefined).diff() / 1000),
                nextCoinReset: Math.floor(moment(role.dailyRefreshData[this.app.mKey.coinDrawReset] || undefined).diff() / 1000),
                coinDrawCount: role.dailyRefreshData[this.app.mKey.coinDrawCount] || 0,
                equipRefineDefs: cache.clientEquipRefine,
                roleExpDefs: cache.clientRoleExp,
                heroExpDefs: cache.clientHeroExp,
                equipUpgradeDefs: cache.clientEquipUpgrade
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
        models.Role.get(role.id).update({lastLogOff: new Date()}).execute();
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
