var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
var logger;


module.exports = function (app) {
    return new ItemHandler(app);
};

class ItemHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    listDef(msg, session, next) {
        this.safe(models.ItemDef.allP().bind(this)
        .then((defs) => {
            next(null, {
                defs: _.map(defs, (hd) => { return hd.toClientObj(); })
            });
        }), next);
    }

    list(msg, session, next) {
        var roleId = session.get("role").id;
        this.safe(models.Item.allP({where: {owner: roleId}}).bind(this)
        .then((items) => {
            next(null, {
                items: _.map(items, (item) => { return item.toClientObj(); })
            });
        }), next);
    }

    sell(msg, session, next) {

    }

    destroy(msg, session, next) {

    }

    transform(msg, session, next) {

    }
}