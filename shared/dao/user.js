var bcrypt = require("bcrypt");
var models = require("../models");
var constants = require("../constants");
var _ = require("lodash");
var Promise = require("bluebird");

class UserHelper {
    isUserAuthMatch(user, accType, uname, password) {
        if (user) {
            for (var i=0;i<user.auth.length;i++) {
                var auth = user.auth[i];
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
        return models.User.getAll([accType, uname], {index: "auth"}).limit(2).run()
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

    changePassword(uid, accType, oldPassword, newPassword) {
        return models.User.get(uid).run()
        .then((user) => {
            for (var i=0;i<user.auth.length;i++) {
                var auth = user.auth[i];
                if (auth.type === accType){
                    if (bcrypt.compareSync(oldPassword, auth.password)) {
                        auth.password = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(5));
                        return user.save();
                    }
                    else {
                        return Promise.reject("old password does not match.");
                    }
                }
            }
            return Promise.reject("No account type matched.");
        });
    }

    toRPCObj(user) {
        var ret = {
            id: user.id,
            name: user.name,
            joinDate: +user.joinDate,
            isNew: user.isNew || undefined
        };

        return ret;
    }
}

module.exports = new UserHelper();
