var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("underscore");
var logger;


module.exports = function (app) {
    return new HeroHandler(app);
};

class HeroHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    list(msg, session, next) {
        var roleId = session.get("role").id;
        this.safe(models.Hero.allP({where: {owner: roleId}}).bind(this)
        .then((heroes) => {
            next(null, {
                heroes: _.map(heroes, (h) => { return h.toClientObj(); })
            });
        }), next);
    }

    recruit(msg, session, next) {

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
}
