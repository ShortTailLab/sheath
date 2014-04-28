var userDAO = require("../../shared/dao/user.js");
var _ = require("lodash");
var crypto = require('crypto');
var appModels = require("../../shared/models");
var channelMap = require("../../shared/OPChannelMap");
var GoldItems = require("../../game-server/config/data/goldItems.json");

exports.logRedirect = function (req, res) {
    var log = new appModels.Log();

    log.severity = "INFO";
    log.type = "click-thru";
    log.time = new Date();
    log.server = "web-0";
    log.msg = {
        source: req.query.source
    };

    log.save();
};

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
    var uname = req.param("name").toLowerCase();
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

function notifyPurchase(channelId, loginId, order) {
    var result = parseInt(order.result),
        price = parseInt(order.price),
        goodId = ""+order.goodId,
        orderId = ""+order.orderId;
    var channelName = channelMap.ID2Name(channelId);
    var goldItem = GoldItems[goodId];

    if (result !== 1 || !channelName || !goldItem || goldItem.channel !== channelName) {
        return;
    }
    if (goldItem.price * 100 !== price) {
        return;
    }

    return appModels.PurchaseLog.get(orderId)
    .then(function (pl) {
        if (!pl) {
            return (new appModels.PurchaseLog({
                id: orderId,
                channelName: channelName,
                role: loginId,
                state: 0,
                extraParams: order
            })).save();
        }
        return pl;
    })
    .then(function (pLog) {
        if (pLog.state !== 1) {
            pLog.state = 1;
        }
    })
    .spread(function () {
    })
    .catch(function (err) {
        var log = new appModels.Log();

        log.severity = "ERROR";
        log.type = "purchase";
        log.time = new Date();
        log.server = "web-0";
        log.msg = {
            channelId: channelId,
            loginId: loginId,
            order: order,
            err: ""+err
        };

        log.save();
    });
}

exports.purchase = function (req, res) {
    var receipt = req.body;
    var channelId = receipt.channelId;
    var data = receipt.data;
    var loginId = receipt.loginId;

    if (!channelId || !data || !loginId) {
        return res.send("NOT OK");
    }

    for (var i=0;i<data.length;i++) {
        notifyPurchase(channelId, loginId, data[i]);
    }
    res.send("OK");
};
