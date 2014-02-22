

var TaskService = function () {
    this.firstTime = true;
};

TaskService.prototype.initOnce = function() {
    if (this.firstTime) {
        this.firstTime = false;
        return true;
    }
    return false;
};

module.exports = new TaskService();
