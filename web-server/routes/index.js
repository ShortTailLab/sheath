var userDAO = require("../../shared/dao/user.js");
var _ = require("underscore");
var crypto = require('crypto');


exports.index = function (req, res) {
    res.render('index', {user: req.session.user, show_debug: process.env.NODE_ENV !== "production"});
};

exports.partials = function (req, res) {
    var name = req.params.name;
    res.render('partials/' + name, {user: req.session.user, show_debug: process.env.NODE_ENV !== "production"});
};

exports.templates = function (req, res) {
    var name = req.params.name;
    res.render('templates/' + name);
};

exports.login = function (req, res) {
    res.render('login');
};

exports.postLogin = function (req, res) {
    var uname = req.param("name");
    var pwd = req.param("password");

    var shasum = crypto.createHash("sha1");
    shasum.update(pwd);
    pwd = shasum.digest("hex");

    userDAO.getUserByAuth("main", uname, pwd).spread(function (user, err) {
        if (user && user.manRole) {
            var sessionUser = _.pick(user, "id", "manRole");
            for (var i=0;i<user.auth.length;i++) {
                if (user.auth[i].type === "main") {
                    sessionUser.name = user.auth[i].id;
                    break;
                }
            }

            req.session.user = sessionUser;
            res.redirect("/");
        }
        else {
            res.send(400);
        }
    });
};

exports.logout = function (req, res) {
    req.session.destroy(function () {
        res.redirect('/login');
    });
};
