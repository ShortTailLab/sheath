var _ = require("lodash");
var Constants = require("../../../shared/constants");

class AuthFilter {
    constructor(...items) {
        this.excludeList = items;
    }

    before(msg, session, next) {
        if (!_.contains(this.excludeList, msg.__route__) && (!session.uid || !session.get("role"))) {
            next(Constants.NEED_AUTH);
        }
        else {
            next();
        }
    }
}

module.exports = AuthFilter;
