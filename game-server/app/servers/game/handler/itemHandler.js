var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Store = require("../../../services/storeService");
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

    maxDailyRefresh(role) {
        var max = [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6];
        if (0 <= role.vipLevel < max.length) {
            return max[role.vipLevel];
        }
        return max[0];
    }

    listDef(msg, session, next) {
        wrapSession(session);

        var cache = this.app.get("cache");
        next(null, {
            items: cache.clientItemDefs,
            equipments: cache.clientEquipmentDefs
        });
    }

    list(msg, session, next) {
        wrapSession(session);

        var roleId = session.get("role").id;
        this.safe(models.Item.allP({where: {owner: roleId}}).bind(this)
        .then((items) => {
            next(null, {
                items: _.invoke(items, "toClientObj")
            });
        }), next);
    }

    listStore(msg, session, next) {
        wrapSession(session);

        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
        }), next);
    }

    buy(msg, session, next) {
        wrapSession(session);
    }

    sell(msg, session, next) {
        wrapSession(session);
    }

    destroy(msg, session, next) {
        wrapSession(session);
    }

    transform(msg, session, next) {

    }
}
