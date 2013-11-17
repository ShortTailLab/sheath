var db = require('jugglingdb');
var Promise = require('bluebird');
var r = require("rethinkdb");

exports.init = function (dbConfig) {
    var schema = exports.schema = new db.Schema("rethink", dbConfig);
    // As a workaround, array type should be rename to JSON type

    var User = exports.User = schema.define("user", {
        auth: {type: db.Schema.JSON, default: new Array},
        joinDate: {type: Date, default: function () { return new Date; }},
        activated: {type: Boolean, default: true},

        adminName: {type: String},
        manRole: {type: String}
    }, {
        auth: {index: true, indexOption: {multi: true}, indexFunction: function (user) {
            return user("auth").map(function (auth) {
                return [auth("type"), auth("id")];
            });
        }}
    });

    var Partition = exports.Partition = schema.define("partition", {
        name: {type: String, default: ""},
        publicSince: {type: Date, default: function () { return new Date; }}
    });

    var Role = exports.Role = schema.define("role", {
        name: {type: String, default: ""},
        createTime: {type: Date, default: function () { return new Date; }}
    });

    var Log = exports.Log = schema.define("log", {
        severity: String,
        time: Date,
        server: String,
        msg: Object
    });

    // relations should be used mostly in web server
    Partition.hasMany(Role, {as: "roles", foreignKey: "partition"});
    User.hasMany(Role, {as: "roles", foreignKey: "owner"});

    return schema;
};
