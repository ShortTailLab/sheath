var userDAO = require("../../shared/dao/user.js");
var _ = require("underscore");


exports.index = function (req, res) {
    res.render('index', {user: req.session.user});
};

exports.partials = function (req, res) {
    var name = req.params.name;
    res.render('partials/' + name);
};

exports.login = function (req, res) {
    res.render('login');
};

exports.postLogin = function (req, res) {
    var uname = req.param("name");
    var pwd = req.param("password");

    userDAO.getUserByAuth("main", uname, pwd).spread(function (user, err) {
        if (user && user.activated) {
            req.session.user = {
                id: user.id,
                name: user.adminName
            };
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
