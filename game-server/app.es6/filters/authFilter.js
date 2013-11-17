var _ = require("underscore");
var Constants = require("../../../shared/constants");

class AuthFilter {
    constructor(...items) {
        this.excludeList = items;
    }

    before(msg, session, next) {
        if (!_.contains(this.excludeList, msg.__route__) && !session.uid) {
            next({
                __sheath__error__: true,
                code: Constants.NeedAuth
            });
        }
        else {
            next();
        }
    }
}

module.exports = AuthFilter;
