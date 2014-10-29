#! /usr/bin/env node

require("../shared/traceurBootstrap");
var dao = require("../shared/dao/user");
var models = require("../shared/models");
var readline = require('readline');
var crypto = require("crypto");
var Promise = require("bluebird");
var _ = require("lodash");
var dbConfig = require("../game-server/config/rethinkdb.json");

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


function promptInput(question) {
    return new Promise(function (resolve, reject) {
        rl.question(question, function (answer) {
            resolve(answer.trim());
        });
    });
}

function promptConfirm(question, defaultValue, validOptions) {
    defaultValue = defaultValue || "yes";
    validOptions = validOptions || ["yes", "no"];

    var optLine = _.map(validOptions, function (opt) {
        if (opt === defaultValue) {
            return "[" + opt + "]";
        }
        else {
            return opt;
        }
    }).join("/");

    question = question + " " + optLine + ":";
    var recursive = function (resolve, reject) {
        rl.question(question, function (answer) {
            answer = answer.trim();
            if (answer === "") {
                answer = defaultValue;
            }
            if (_.contains(validOptions, answer)) {
                resolve(answer);
            }
            else {
                recursive(resolve, reject);
            }
        });
    };

    return new Promise(function (resolve, reject) {
        recursive(resolve, reject);
    });
}

promptConfirm("Choose run environment.", "development", ["production", "test", "development"])
.then(function (env) {
    models.init({
        host: dbConfig[env].host,
        port: dbConfig[env].port,
        database: dbConfig[env].database
    });

    var userName = process.argv[3];

    if (!userName) {
        return promptInput("Enter user login name: ");
    }
    else {
        return userName;
    }
})
.then(function (userName) {
    return [models.User.getAll(userName, {index: "authId"}).limit(1).run(), userName];
})
.all().spread(function (users, userName) {
    if (_.size(users) === 0) {
        return promptConfirm("Create user '" + userName + "'?")
        .then(function (answer) {
            if (answer === "yes") {
                return promptInput("Enter user password: ");
            }
            else {
                return Promise.reject("User canceled");
            }
        })
        .then(function (password) {
            var shasum = crypto.createHash("sha1");
            shasum.update(password);
            password = shasum.digest("hex");
            return dao.newUser("main", userName, password);
        });
    }
    else {
        return promptConfirm("User '" + userName + "' already exists. promote to admin?")
        .then(function (answer) {
            if (answer === "yes") {
                return users[0];
            }
            else {
                return Promise.reject("User canceled");
            }
        });
    }
})
.then(function (user) {
    user.manRole = {
        admin: true,
        editUser: true,
        data: true,
        debug: true,
        announce: true
    };
    return user.save();
})
.then(function () {
    return console.log("Done!");
})
.catch(function (err) {
    console.log(err);
})
.finally(function (){
    process.exit(0);
});
