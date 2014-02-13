var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");

module.exports = function (app) {
    return new MailRemote(app);
};

class MailRemote {
    constructor(app) {
        this.app = app;
    }

    sendTreasureMail(sender, target, content, cb) {
        var mail = new models.Mail({
            sender: sender,
            target: target,
            text: content
        });
        this.safe(mail.saveP().then(function (m) {
            cb(null, mail.id);
        }), cb);
    }
}
