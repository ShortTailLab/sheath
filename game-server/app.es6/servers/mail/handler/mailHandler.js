var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
var logger;


module.exports = function (app) {
    return new MailHandler(app);
};

class MailHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    listMail(msg, session, next) {
        wrapSession(session);

        this.safe(models.Mail.allP({where: {target: session.get("role").id}, order: "time DESC"})
        .then(function (mails) {
            next(null, {
                mails: _.invoke(mails, "toClientObj")
            });
        }), next);
    }

    checkNewMail(msg, session, next) {
        wrapSession(session);

        this.safe(models.Mail.allP({where: {target: session.get("role").id, read: false}, order: "time DESC"})
        .then(function (mails) {
            next(null, {
                mails: _.invoke(mails, "toClientObj")
            });
        }), next);
    }

    readMail(msg, session, next) {
        wrapSession(session);

        var mailId = msg.mailId;
        if (!mailId) {
            return this.errorNext(Constants.Mail_Do_Not_Exist, next);
        }

        this.safe(models.Mail.findP(mailId)
        .then(function (mail) {
            if (!mail || mail.target !== session.get("role").id) {
                return Promise.reject(Constants.Mail_Do_Not_Exist);
            }
            return mail.updateAttributeP("read", true);
        })
        .then(function (m) {
            next(null, {ok: true});
        }), next);
    }

    claimMailTreasure(msg, session, next) {
        wrapSession(session);

        var mailId = msg.mailId;
        if (!mailId) {
            return this.errorNext(Constants.Mail_Do_Not_Exist, next);
        }

        this.safe(models.Mail.findP(mailId).bind(this)
        .then(function (mail) {
            if (!mail || mail.target !== session.get("role").id) {
                return Promise.reject(Constants.Mail_Do_Not_Exist);
            }
        }));
    }
}
