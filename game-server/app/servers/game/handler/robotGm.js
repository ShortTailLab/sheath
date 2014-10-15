var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Store = require("../../../services/storeService");
var Promise = require("bluebird");
var moment = require("moment");
var _ = require("lodash");
var logger;


module.exports = function (app) {
    return new RobotGm(app);
};

class RobotGm extends base.HandlerBase
{
    constructor(app)
    {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    doGmCmd(msg, session, next)
    {
        wrapSession(session);

        if(this.app.get("env") === "production") {
            next(null, {});
            return;
        }

        var role = session.get("role");
        var cmdType = msg.cmdType;

        if (cmdType === "addMoney") {
            this.safe(models.Role.get(role.id).run()
            .then(function (_role) {
                role = _role;
                role.golds += 10000;
                role.coins += 10000;
                return role.save();
            })
            .then(function (role) {
                next(null, {
                    golds: role.golds,
                    coins: role.coins
                });
            }), next);
        }
        else if(cmdType === "addEnergy") {
            this.safe(models.Role.get(role.id).run()
            .then(function (_role) {
                role = _role;
                role.energy += 10000;
                return role.save();
            })
            .then(function (role) {
                next(null, {
                    energy: role.energy
                });
            }), next);
        }
        else if(cmdType === "addSoul") {
            this.safe(models.Role.get(role.id).run()
            .then(function (_role) {
                role = _role;
                role.souls["" + msg.heroId] += 1000;
                return role.save();
            })
            .then(function (role) {
                next(null, {});
            }), next);
        }
        else if(cmdType === "refreshPurchase") {
            var mKey = this.app.mKey;
            this.safe(models.Role.get(role.id).run()
            .then(function (_role) {
                role = _role;
                role.dailyRefreshData[mKey.coinPurchaseNum] = 0;
                role.dailyRefreshData[mKey.goldPurchaseNum] = 0;
                return role.save();
            })
            .then(function (role) {
                next(null, {});
            }), next);
        }
        else if(cmdType === "upgradeLevel") {
            this.safe(models.Role.get(role.id).run()
            .then(function (_role) {
                role = _role;
                role.level += 10;
                return role.save();
            })
            .then(function (role) {
                next(null, {
                    level: role.level
                });
            }), next);
        }
        else if(cmdType === "reset") {
            var resetType = msg.resetOpt.type;
            if(resetType === "claimDailyReward") {
                this.safe(models.Role.get(role.id).run()
                .then(function (_role) {
                    role = _role;
                    role.dailyRefreshData.dailyReward = false;
                    session.set("role", role.toSessionObj());
                    return [role.save(), session.push("role")];
                })
                .spread(function (role) {
                    next(null, {});
                }), next);
            }
            else if(resetType === "claimHourlyReward") {
                this.safe(models.Role.get(role.id).run()
                .then(function (_role) {
                    role = _role;
                    role.dailyRefreshData.qhourlyReward = 0;
                    session.set("role", role.toSessionObj());
                    return [role.save(), session.push("role")];
                })
                .spread(function (role) {
                    next(null, {});
                }), next);
            }
            else if(resetType === "upgradeEquip") {
                var eqId = msg.resetOpt.eqId;
                this.safe(this.getEquipmentWithDef(eqId)
                .then(function(eqs) {
                    var equipment = eqs[0];
                    equipment.level = 1;
                    return equipment.save();
                })
                .then(function() {
                    next(null, {});
                }), next);
            }
            else if(resetType === "refineWeapon") {
                var eqId = msg.resetOpt.eqId;
                this.safe(this.getEquipmentWithDef(eqId)
                .then(function(eqs) {
                    var equipment = eqs[0];
                    equipment.refinement = 0;
                    return equipment.save();
                })
                .then(function() {
                    next(null, {});
                }), next);
            }
            else if(resetType === "setGem") {
                var gemId = msg.resetOpt.gemId;
                this.safe(this.getGemWithDef(gemId)
                .then(function(arr) {
                    var gem = arr[0];
                    gem.bound = null;
                    return gem.save();
                })
                .then(function() {
                    next(null, {});
                }), next);
            }
            else if(resetType === "tutorial") {
                this.safe(models.Role.get(role.id).run()
                .then(function (_role) {
                    role = _role;
                    role.tutorial = 1;
                    session.set("role", role.toSessionObj());
                    return [role.save(), session.push("role")];
                })
                .spread(function (role) {
                    next(null, {tutorial: 1});
                }), next);
            }
        }
        else if(cmdType === "addMail") {
            this.safe(models.Treasure.run()
            .then(function(data) {
                var treasures = _.map(data, function (t) {
                    return t.id;
                });
                return (new models.Mail({
                    sender: null,
                    target: role.id,
                    text: "text",
                    treasures: treasures
                })).save();
            })
            .then(function(mail) {
                next(null, {mail: mail.toClientObj()});
            }), next);
        }
        else if(cmdType === "delHero") {
            this.safe(models.Hero.getAll(role.id, {index: "owner"}).filter({heroDefId: msg.heroId}).delete().run()
            .then(function() {
                next(null, {});
            }), next);
        }
    }
}


