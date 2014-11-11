var models = require("../../../../../shared/models");
var r = models.r;
var treasureClaim = require("../../../../../shared/treasureClaim");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("lodash");
var logger;


module.exports = function (app) {
    return new MailHandler(app);
};

class MailHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    list(msg, session, next) {
        wrapSession(session);

        this.safe(models.Mail.getAll(session.get("role").id, {index: "target"}).orderBy(r.desc("time")).run()
        .then(function (mails) {
            next(null, {
                mails: _.invoke(mails, "toClientObj")
            });
        }), next);
    }

    checkNewMail(msg, session, next) {
        wrapSession(session);

        this.safe(models.Mail.getAll(session.get("role").id, {index: "target"}).filter(r.row("read").eq(false)).orderBy(r.desc("time")).run()
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

        this.safe(models.Mail.get(mailId).run()
        .then(function (mail) {
            if (!mail || mail.target !== session.get("role").id) {
                throw Constants.Mail_Do_Not_Exist;
            }
            return models.Mail.get(mail.id).update({"read": true}).run();
        })
        .then(function () {
            next(null, {ok: true});
        }), next);
    }

    claimTreasure(msg, session, next) {
        wrapSession(session);

        var mailId = msg.mailId, mail, role;
        if (!mailId) {
            return this.errorNext(Constants.Mail_Do_Not_Exist, next);
        }

        this.safe(models.Mail.get(mailId).run().bind(this)
        .then(function (_mail) {
            mail = _mail;
            if (!_mail || _mail.target !== session.get("role").id) {
                throw Constants.Mail_Do_Not_Exist;
            }
            if (_mail.claimed || _mail.treasures.length === 0) {
                throw Constants.ALREADY_CLAIMED;
            }
            return models.Role.get(session.get("role").id).run();
        })
        .then(function (_role) {
            role = _role;
            var gain = treasureClaim.claim(role, mail.treasures);
            var claim = models.Mail.get(mail.id).update({"claimed": true}).run();
            session.set("role", role.toSessionObj());
            return [gain, claim, session.push("role")];
        })
        .spread(function (gain) {
            next(null, {
                role: role.toClientObj(),
                gain: gain
            });
            logger.logInfo("mail.claimed", {
                user: session.uid,
                role: role.toLogObj(),
                mail: mail.toLogObj(),
                gain: gain
            });
        }), next);
    }
}
