var db = require('jugglingdb');
var Promise = require('bluebird');
var r = require("rethinkdb");

exports.init = function (dbConfig) {
    var schema = exports.schema = new db.Schema("rethink", dbConfig);
    // As a workaround, array type should be rename to JSON type

    var User = exports.User = schema.define("user", {
        auth: {type: db.Schema.JSON, default: function () { return new Array(); } },
        joinDate: {type: Date, default: function () { return new Date(); }},
        activated: {type: Boolean, default: true},
        isNew: Boolean,

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
        public: {type: Boolean, default: true},
        openSince: {type: Date, default: function () { return new Date(); }}
    });

    var Role = exports.Role = schema.define("role", {
        name: {type: String, default: ""},
        level: {type: Number, default: 1},
        createTime: {type: Date, default: function () { return new Date(); }},

        isNew: Boolean
    });

    var Log = exports.Log = schema.define("log", {
        severity: String,
        time: Date,
        server: String,
        msg: Object
    });

    var HeroDef = exports.HeroDef = schema.define("herodef", {
        name: {type: String, default: ""},
        male: {type: Boolean, default: false},
        stars: {type: Number, default: 3},
        maxLevel: {type: Number, default: 90},
        face: {type: String, default: ""},
        skill: {type: db.Schema.JSON, default: function () {return [];}},

        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    var Hero = exports.Hero = schema.define("hero", {
        type: {type: String, default: ""},
        level: {type: Number, default: 1},
        exp: {type: Number, default: 0}
    });

    var Equipment = exports.Equipment = schema.define("equipment", {
        type: {type: String, default: ""},

        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    // relations should be used mostly in web server
    Partition.hasMany(Role, {as: "roles", foreignKey: "partition"});
    User.hasMany(Role, {as: "roles", foreignKey: "owner"});
    Role.hasMany(Hero, {as: "heroes", foreignKey: "owner"});
    Hero.hasMany(Equipment, {as: "equipments", foreignKey: "bound"});
    Hero.belongsTo(HeroDef, {as: "def", foreignKey: "heroDefId"});

    return schema;
};
