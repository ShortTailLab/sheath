var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var logger;


module.exports = function (app) {
    return new EquipmentHandler(app);
};

class EquipmentHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
    }

    equip(msg, session, next) {
        var itemId = msg.itemId;
        var heroId = msg.heroId;
        var role = session.get("role");

        Promise.all(models.Role.findP(role.id), models.Item.findP(itemId))
        .spread((role, item) => {
            if (!role || !item || item.owner !== role.id) {
                this.errorNext(Constants.EquipmentFailed.DO_NOT_OWN_ITEM, next);
                return;
            }
        })
        .catch((err) => {
            this.errorNext(err, next);
        });
    }

    unEquip(msg, session, next) {

    }

    forge(msg, session, next) {

    }

    setGem(msg, session, next) {

    }

    removeGem(msg, session, next) {

    }
}
