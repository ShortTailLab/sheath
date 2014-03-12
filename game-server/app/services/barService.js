var utils = require("../../../shared/utils");
var _ = require("underscore");
var moment = require("moment");

class BarService
{
    constructor() {
        this.app = null;

        this.nextRefresh = null;
        this.heroes = null;
    }

    initOnce(app) {
        if (utils.initOnce("barService")) {
            this.app = app;
            this.refresh();
        }
    }

    nextRefreshTime() {
        var now = moment();
        now.seconds(0);
        now.minutes(0);
        now.hours(Math.ceil(now.hours()/2) * 2);

        return Math.floor(+now/1000);
    }

    sample(oldItems=null) {
        var cache = this.app.get("cache");
        var pool = cache.heroDefs;
        var candidate = [];

        for (var i=0;i<10;i++) {
            candidate = _.sample(pool, 12);
            if (candidate.length === pool.length || !oldItems) {
                return candidate;
            }
            else {
                var oldIds = _.pluck(oldItems, "id");
                var newIds = _.pluck(candidate, "id");
                if (_.difference(newIds, oldIds).length > 0) {
                    return candidate;
                }
            }
        }
        return candidate;
    }

    refresh() {
        this.heroes = _.pluck(this.sample(this.heroes), "id");
        this.nextRefresh = this.nextRefreshTime();
    }

    listHeroes() {
        if (this.nextRefresh * 1000 <= Date.now()) {
            this.refresh();
        }
        return this.heroes;
    }

    getFreeRefresh(role) {

    }

    getPaidRefresh(role) {

    }
}

module.exports = new BarService();
