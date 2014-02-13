var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");

module.exports = function (app) {
    return new MailRemote(app);
};

class MailRemote extends base.HandlerBase {
    constructor(app) {
        this.app = app;
    }

    sendTreasureMail(sender, target, content, cb) {
        this.safe(models.Mail.createP({
            sender: sender,
            target: target,
            text: content
        })
        .then(function (m) {
            cb(null, m.id);
        }), cb);
    }
}
