var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Promise = require("bluebird");

module.exports = function (app) {
    return new MailRemote(app);
};

class MailRemote extends base.HandlerBase {
    constructor(app) {
        this.app = app;
    }

    sendTreasureMail(sender, target, content, cb) {
        var role, mail;

        this.safe(models.Role.get(target).run().bind(this)
        .then(function (_role) {
            if (!_role) {
                return Promise.reject(Constants.Role_Do_Not_Exist);
            }
            role = _role;
            return (new models.Mail({
                sender: sender,
                target: target,
                text: content
            })).save();
        })
        .then(function (m) {
            mail = m;
            var statusService = this.app.get('statusService');
            return statusService.pushByUids([role.owner], "onMail", m.toClientObj());
        })
        .then(function () {
            cb(null, mail.id);
        }), cb);
    }
}
