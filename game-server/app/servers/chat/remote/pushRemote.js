var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var utils = require("../../../../../shared/utils");
var Promise = require("bluebird");
var jpush = require("jpush-sdk");
var _ = require("lodash");

module.exports = function (app) {
    return new PushRemote(app);
};

class PushRemote extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        this.pushClient = null;
        this.pushCount = 1;
    }

    getConn() {
        if (!this.pushClient) {
            this.pushClient = jpush.buildClient("6d8717fbfdb615912e227235", "774f312c815a69c5587dfa5a");
        }
        return this.pushClient;
    }

    setPayload(conn, msg) {
        if (typeof msg === "string") {
            conn.setNotification(msg);
        }
        else {
            var pushContent = [msg.content];
            if (msg.ios) {
                pushContent.push(jpush.ios(msg.content, msg.ios.sound, msg.ios.badge, msg.ios.contentAvailable, msg.ios.extras));
            }
            if (msg.android) {
                pushContent.push(jpush.android(msg.content, msg.android.title, msg.android.builder_id, msg.android.extras));
            }
            conn.setNotification.apply(conn, pushContent);
        }

        return conn;
    }

    pushAll(msg, cb) {
        var conn = this.getConn();
        cb = cb || function () {};
        this.pushCount++;
        this.setPayload(conn.push().setPlatform(jpush.ALL).setAudience(jpush.ALL), msg).send(cb);
    }

    pushToPartition(partId, msg, cb) {
        var conn = this.getConn();
        cb = cb || function () {};
        this.pushCount++;
        this.setPayload(conn.push().setPlatform(jpush.ALL).setAudience(jpush.tag(partId)), msg).send(cb);
    }

    pushToUser(userId, msg, cb) {
        models.Role.getAll(userId, {index: "owner"}).run().bind(this)
        .then(function (roles) {
            if (roles.length) {
                this.pushTo(_.pluck(roles, "id"), msg, cb);
            }
        });
    }

    pushTo(roles, msg, cb) {
        if (typeof roles === "string") {
            roles = [roles];
        }
        var roleChunks = utils.toChunk(roles, 1000);
        var conn = this.getConn();
        var chunksLeft = roleChunks.length;

        var partialCB = function (err) {
            if (err) cb(err);
            else if (--chunksLeft === 0) {
                cb();
            }
        };

        for (var i=0;i<roleChunks.length;i++) {
            this.setPayload(conn.push().setPlatform(jpush.ALL).setAudience(jpush.alias(roleChunks[i])), msg).send(partialCB);
        }
    }
}
