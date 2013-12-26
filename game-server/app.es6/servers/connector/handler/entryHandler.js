var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var userDAO = require("../../../../../shared/dao/user");
var models = require("../../../../../shared/models");
var logger;


module.exports = function (app) {
    return new EntryHandler(app);
};

class EntryHandler {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    enter(msg, session, next) {
        if (!msg.accType || !msg.username || !msg.password) {
            next(null, {error: {code: Constants.InvalidRequest}});
            return;
        }
        wrapSession(session);

        try {
            var user, self = this;
            await user = self.app.rpc.auth.authRemote.authenticateAsync(session, msg.accType, msg.username, msg.password);
            if (!user) {
                return next(null, {error: {code: Constants.LoginFailed.ID_PASSWORD_MISMATCH}});
            }
            if (session.uid) {
                if (session.uid === user.id) {
                    session.unbind(user.id);
                }
                else {
                    await self.app.get('sessionService').kick(user.id);
                }
            }

            await session.bind(user.id);
            session.on('closed', onUserLeave.bind(null, this.app));
            next(null, {user: user});

            logger.logInfo({
                "type": "user.login",
                "user": user.id
            });
        }
        catch (err) {
            console.log(err);
            next(null, {error: {code: err.code, message: err.messages}});
        }
    }

    listPartitions(msg, session, next) {
        models.Partition.allP({where: {public: true}}).then((partitions) => {

        })
        .catch((err) => {
            console.log(err);
            next(null, {error: {code: err.code, message: err.messages}});
        });
    }

    enterPartition(msg, session, next) {
        var self = this;
        this.app.rpc.chat.chatRemote.add(session, uid, user.name, self.app.get('serverId'), rid, function(users){
            next(null, {
                users:users
            });
        });
    }
}

var onUserLeave = function (app, session, reason) {
    if (session.get("user").name) {
        app.rpc.chat.chatRemote.kick(session, session.uid, session.get("user").name, app.get('serverId'), session.get('parId'), null);
    }
    logger.logInfo({
        "type": "user.logout",
        "user": session.uid
    });
};
