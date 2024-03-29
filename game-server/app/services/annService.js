var utils = require("../../../shared/utils");
var models = require("../../../shared/models");
var r = models.r;
var _ = require("lodash");
var schedule = require("pomelo-schedule");


var AnnService = function () {
    this.app = null;
    this.inEffectAnnouncemeents = {all: []};
    this.allAnns = {};
};

AnnService.prototype.initOnce = function(app) {
    if (utils.initOnce("annService")) {
        this.app = app;
        this.inEffectAnnouncemeents = {all: []};
        this.allAnns = {};

        models.Announcement.filter(r.row("end").gt(r.now())).run().bind(this)
        .then(function (anns) {
            for (var i=0;i<anns.length;i++) {
                this.addAnnAux(anns[i]);
            }
        });
    }
};

AnnService.prototype.startAnn = function(ann) {
    var channelService = this.app.get("channelService");
    var message = ann.toClientObj();
    if (ann.partitions.length === 0 || ann.partitions[0] === "*") {
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
};

AnnService.prototype.endAnn = function(annId) {
    var ann = this.allAnns[annId];
    if (!ann) {
        return;
    }

    if (ann.startJob) {
        schedule.cancelJob(ann.startJob);
        ann.startJob = undefined;
    }
    if (ann.endJob) {
        schedule.cancelJob(ann.endJob);
        ann.endJob = undefined;
    }

    var channelService = this.app.get("channelService");
    delete this.allAnns[ann.id];
    var message = {id: ann.id};
    if (ann.partitions.length === 0 || ann.partitions[0] === "*") {
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
};

AnnService.prototype.addAnnAux = function(ann) {
    var now = new Date();
    if (ann.end < now) {
        return;
    }
    this.allAnns[ann.id] = ann;

    if (ann.start <= now) {
        this.startAnn(ann);
    }
    else {
        ann.startJob = schedule.scheduleJob({start: ann.start}, this.startAnn.bind(this, ann));
    }

    ann.endJob = schedule.scheduleJob({start: ann.end}, this.endAnn.bind(this, ann));
};

AnnService.prototype.getAnnsByPartId = function(partId) {
    return this.inEffectAnnouncemeents.all.concat(this.inEffectAnnouncemeents[partId] || []);
};

module.exports = new AnnService();
