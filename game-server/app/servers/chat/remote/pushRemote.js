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
            this.pushClient = new jpush.build({appKey: "6d8717fbfdb615912e227235", masterSecret: "774f312c815a69c5587dfa5a"});
        }
        return this.pushClient;
    }

    getNotification(msg) {
        var note = {
            type: 1,
            platform: this.getConn().platformType.both
        };
        if (typeof msg === "string") {
            note.content = msg;
        }
        else {
            note.content = {
                n_content: msg.content,
                n_title: msg.title,
                n_extra: msg.extra || {}
            };
            note.content.n_extra.ios = {
                badge: msg.badge,
                sound: msg.sound
            };
        }

        return note;
    }

    pushAll(msg, cb) {
        var note = this.getNotification(msg);
        var conn = this.getConn();
        var receiver = {
            type: conn.pushType.broadcast,
            value: ""
        };
        cb = cb || function () {};
        conn.pushSimpleNotification(this.pushCount++, receiver, note, cb);
    }

    pushToPartition(partId, msg, cb) {
        var note = this.getNotification(msg);
        var conn = this.getConn();
        var receiver = {
            type: conn.pushType.tag,
            value: partId
        };
        cb = cb || function () {};
        conn.pushSimpleNotification(this.pushCount++, receiver, note, cb);
    }

    pushToUser(userId, msg, cb) {
        models.Role.allP({where: {owner: userId}}).bind(this)
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
        var note = this.getNotification(msg);
        var conn = this.getConn();
        var receiver = {
            type: conn.pushType.alias,
            value: ""
        };

        for (var i=0;i<roleChunks.length;i++) {
            receiver.value = roleChunks[i].join(",");
            conn.pushSimpleNotification(this.pushCount++, receiver, note, cb);
        }
        if (cb) cb();
    }
}
