var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var userDAO = require("../../../../../shared/dao/user");
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
                return next(null, {error: {code: Constants.LoginFailed.AlreadyLoggedIn}});
            }

            try {
                await self.app.get('sessionService').kick(user.id);
            }
            catch (err) {
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

    }

    enterPartition(msg, session, next) {

    }
}

var onUserLeave = function (app, session, reason) {
    logger.logInfo({
        "type": "user.logout",
        "user": session.uid
    });
};
