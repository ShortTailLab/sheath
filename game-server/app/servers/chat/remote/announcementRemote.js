var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var schedule = require("node-schedule");
var _ = require("underscore");

module.exports = function (app) {
    return new AnnouncementRemote(app);
};

class AnnouncementRemote {
    constructor(app) {
        this.app = app;
        this.inEffectAnnouncemeents = {all: []};
        this.allAnns = {};

        if (this.app.serverType === "chat") {
            models.Announcement.allP({where: {end: {gt: new Date()}}}).bind(this)
            .then(function (anns) {
                for (var i=0;i<anns.length;i++) {
                    this.addAnnAux(anns[i]);
                }
            });
        }
    }

    startAnn(ann) {
        var channelService = this.app.get("channelService");
        var message = ann.toClientObj();
        if (ann.partitions === ["*"]) {
            this.inEffectAnnouncemeents.all.push(ann);
            channelService.broadcast("connector", "onAnnounce", message);
        }
        else {
            for (var i=0;i<ann.partitions.length;i++) {
                var partId = ann.partitions[i];
                if (!this.inEffectAnnouncemeents[partId]) this.inEffectAnnouncemeents[partId] = [];
                this.inEffectAnnouncemeents[partId].push(ann);
                var channel = channelService.getChannel(partId, false);
                if (channel) {
                    channel.pushMessage('onAnnounce', message);
                }
            }
        }
    }

    endAnn(ann) {
        var channelService = this.app.get("channelService");
        delete this.allAnns[ann.id];
        var message = {id: ann.id};
        if (ann.partitions === ["*"]) {
            this.inEffectAnnouncemeents.all = _.without(this.inEffectAnnouncemeents.all, ann);
            channelService.broadcast("connector", "onEndAnnounce", message);
        }
        else {
            for (var i=0;i<ann.partitions.length;i++) {
                var partId = ann.partitions[i];
                if (this.inEffectAnnouncemeents[partId]) {
                    this.inEffectAnnouncemeents[partId] = _.without(this.inEffectAnnouncemeents[partId], ann);
                }

                var channel = channelService.getChannel(partId, false);
                if (channel) {
                    channel.pushMessage('onEndAnnounce', message);
                }
            }
        }
    }

    addAnnAux(ann) {
        var now = new Date();
        if (ann.end < now) {
            return;
        }
        this.allAnns[ann.id] = ann;

        if (ann.start <= now) {
            this.startAnn(ann);
        }
        else {
            schedule.scheduleJob(ann.start, this.startAnn.bind(this, ann));
        }

        schedule.scheduleJob(ann.end, this.endAnn.bind(this, ann));
    }

    addAnn(annId, cb) {
        models.Announcement.findP(annId).bind(this)
        .then(function (ann) {
            if (ann) {
                this.addAnnAux(ann);
            }
        })
        .finally(function () {
            cb();
        });
    }

    deleteAnn(annId, cb) {
        var ann = this.allAnns[annId];
        if (ann) {
            this.endAnn(ann);
        }
    }

    userJoined(userId, partId, cb) {
        var statusService = this.app.get('statusService');
        for (var i=0;i<this.inEffectAnnouncemeents.all.length;i++) {
            statusService.pushByUids([userId], "onAnnounce", this.inEffectAnnouncemeents.all[i].toClientObj());
        }
        if (this.inEffectAnnouncemeents[partId]) {
            for (var j=0;j<this.inEffectAnnouncemeents[partId].length;j++) {
                statusService.pushByUids([userId], "onAnnounce", this.inEffectAnnouncemeents[partId][j].toClientObj());
            }
        }
        cb();
    }
}
