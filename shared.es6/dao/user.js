var bcrypt = require("bcrypt");
var models = require("../models");
var constants = require("../constants");
var _ = require("underscore");

class UserHelper {
    isUserAuthMatch(user, accType, uname, password) {
        if (user) {
            for (let auth of user.auth) {
                if (auth.type === accType && auth.id === uname && bcrypt.compareSync(password, auth.password)) {
                    return true;
                }
            }
        }
        return false;
    }

    newUser(accType, uname, password) {
        var u = new models.User();
        u.auth = [
            {
                type: accType,
                id: uname,
                password: bcrypt.hashSync(password, bcrypt.genSaltSync(5))
            }
        ];

        return u;
    }

    getUserByAuth(accType, uname, password) {
        var self = this;
        return models.User.allP({
            where: {
                auth: [accType, uname]
            },
            limit: 2
        })
        .then((users) => {
            if (_.size(users) === 1) {
                var user = _.first(users);
                if (self.isUserAuthMatch(user, accType, uname, password)) {
                    return [user, null];
                }
                else {
                    return [null, constants.LoginFailed.ID_PASSWORD_MISMATCH];
                }
            }
            else if (_.size(users) === 0) {
                return [null, constants.LoginFailed.NO_USER];
            }
            else {
                return [null, constants.InternalServerError];
            }
        });
    }

    toRPCObj(user) {
        var ret = {
            id: user.id,
            name: user.name,
            joinDate: +user.joinDate
        };

        if (user.isNew)
            ret.isNew = true;

        return ret;
    }

    createRoleWithConf() {

    }
}

module.exports = new UserHelper();
