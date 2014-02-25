var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var annService = require("../../../services/annService");
var _ = require("underscore");

module.exports = function (app) {
    return new AnnouncementRemote(app);
};

class AnnouncementRemote {
    constructor(app) {
        this.app = app;

        if (this.app.serverType === "chat") {
            annService.initOnce(app);
        }
    }

    addAnn(annId, cb) {
        models.Announcement.findP(annId).bind(this)
        .then(function (ann) {
            if (ann) {
                annService.addAnnAux(ann);
            }
        })
        .finally(function () {
            cb();
        });
    }

    deleteAnn(annId, cb) {
        annService.endAnn(annId);
        cb();
    }

    userJoined(userId, partId, cb) {
        var statusService = this.app.get('statusService');
        var anns = annService.getAnnsByPartId(partId);

        for (var i=0;i<anns.length;i++) {
            statusService.pushByUids([userId], "onAnnounce", anns[i].toClientObj());
        }
        cb();
    }
}
