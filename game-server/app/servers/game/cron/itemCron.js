var models = require("../../../../../shared/models");
var Store = require("../../../services/storeService");

module.exports = function (app) {
    return new ItemCron(app);
};

class ItemCron {
    constructor(app) {
        this.app = app;
    }

    refresh6() {
        Store.refresh6();
    }


    refresh8() {
        Store.refresh8();
    }
}
