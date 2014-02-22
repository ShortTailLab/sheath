

var AnnService = function () {
    this.firstTime = true;
};

AnnService.prototype.initOnce = function() {
    if (this.firstTime) {
        this.firstTime = false;
        return true;
    }
    return false;
};

module.exports = new AnnService();
