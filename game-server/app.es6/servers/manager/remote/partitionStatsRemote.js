var Constants = require("../../../../../shared/constants");

module.exports = function (app) {
    return new PartitionRemote(app);
};

class PartitionRemote {
    constructor(app) {
        this.app = app;
        this.partitionUserCount = {};
    }

    getUserCount(cb) {
        cb(null, this.partitionUserCount);
    }

    joinPartition(partId, cb) {
        var userCount = this.partitionUserCount[partId] || 0;
        if (userCount < 1000) {
            this.partitionUserCount[partId] = userCount + 1;
            cb(null);
        }
        else {
            cb(Constants.PartitionFailed.PARTITION_FULL);
        }
    }

    leavePartition(partId, cb) {
        this.partitionUserCount[partId] = Math.max((this.partitionUserCount[partId] || 1) - 1, 0);
        cb();
    }
}
