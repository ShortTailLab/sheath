var _ = require("lodash");
var userDAO = require("../../../../../shared/dao/user");
var constants = require("../../../../../shared/constants");
var logger;


module.exports = function (app) {
    return new AuthRemote(app);
};

class AuthRemote {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    authenticate(accType, uname, password, next) {
        userDAO.getUserByAuth(accType, uname, password).spread(function (user, err) {
            if (!err) {
                next(null, userDAO.toRPCObj(user));
            }
            else if (err === constants.LoginFailed.NO_USER) {
                user = userDAO.newUser(accType, uname, password);
                user.isNew = true;

                user.save()
                .then(() => {
                    next(null, userDAO.toRPCObj(user));
                })
                .catch((err) => {
                    next(err);
                });
            }
            else {
                next({code: err, __sheath__error__:true});
            }
        })
        .catch(function (err) {
            next(err);
        });
    }

    register(accType, uname, password, next) {

    }
}
