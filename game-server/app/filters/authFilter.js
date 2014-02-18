var _ = require("underscore");
var Constants = require("../../../shared/constants");

class AuthFilter {
    constructor(...items) {
        this.excludeList = items;
    }

    before(msg, session, next) {
        if (!_.contains(this.excludeList, msg.__route__) && (!session.uid || !session.get("role"))) {
            next({
                __sheath__error__: true,
                code: Constants.NEED_AUTH
            });
        }
        else {
            next();
        }
    }
}

module.exports = AuthFilter;
