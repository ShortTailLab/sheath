var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("lodash");
var logger;


module.exports = function (app) {
    return new TutorialHandler(app);
};

class TutorialHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    setName(msg, session, next) {
        wrapSession(session);

        var newName = msg.name;
        var role = session.get("role");
        if (role.tutorial !== 1) {
            return this.errorNext(Constants.TutorialFailed.TutorialStateError, next);
        }
        if (!newName) {
            return this.errorNext(Constants.NameInvalid, next);
        }

        role.name = newName;
        role.tutorial = 2;
        session.set("role", role);

        this.safe(Promise.join(session.push("role"), models.Role.get(role.id).update({tutorial: 2, name: newName}).run())
        .then(() => {
            next(null, {ok: true, tutorial: 2});
        }), next);
    }

    pickHero(msg, session, next) {
        wrapSession(session);

        var heroId = msg.heroId;

        var newRoleConf = this.app.get("roleBootstrap");
        var role = session.get("role");

        if (role.tutorial !== 2) {
            return this.errorNext(Constants.TutorialFailed.TutorialStateError, next);
        }
        if (!heroId || !_.contains(newRoleConf.initialHeroCandidates, heroId)) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        role.tutorial = 3;
        session.set("role", role);

        var promises = [
            new models.Hero({heroDefId: heroId, owner: role.id}).save(),
            session.push("role"),
            models.Role.get(role.id).update({tutorial: 3}).run()
        ];

        this.safe(Promise.all(promises)
        .spread((newHero) => {
            next(null, {newHero: newHero.toClientObj(), tutorial: 3});
        }), next);
    }
}
