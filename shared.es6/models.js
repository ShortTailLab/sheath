var db = require('jugglingdb');
var Promise = require('bluebird');
var r = require("rethinkdb");

exports.init = function (dbConfig) {
    var schema = exports.schema = new db.Schema("rethink", dbConfig);
    // As a workaround, array type should be rename to JSON type

    var User = exports.User = schema.define("user", {
        auth: {type: db.Schema.JSON, default: function () { return []; } },
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
        openSince: {type: Date, default: function () { return new Date(); }},

        createTime: {type: Date, default: function () { return new Date(); }}
    });

    var Role = exports.Role = schema.define("role", {
        name: {type: String, default: ""},
        level: {type: Number, default: 1},
        exp: {type: Number, default: 0},
        title: {type: String, default: ""},
        vipLevel: {type: Number, default: 0},

        energy: {type: Number, default: 0},
        coins: {type: Number, default: 0},
        golds: {type: Number, default: 0},
        contrib: {type: Number, default: 0},

        dailyRefreshData: {type: db.Schema.JSON, default: function () {return {};}},
        manualRefreshData: {type: db.Schema.JSON, default: function () {return {};}},

        createTime: {type: Date, default: function () { return new Date(); }},
        isNew: Boolean
    });

    var HeroDef = exports.HeroDef = schema.define("herodef", {
        name: {type: String, default: ""},
        resKey: {type: String, default: ""},
        male: {type: Boolean, default: false},
        stars: {type: Number, default: 3},
        maxLevel: {type: Number, default: 90},
        face: {type: String, default: ""},
        skill: {type: db.Schema.JSON, default: function () {return [];}},

        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    var ItemDef = exports.ItemDef = schema.define("itemdef", {
        name: {type: String, default: ""},
        type: {type: String, default: ""},
        resKey: {type: String, default: ""},
        levelReq: {type: Number, default: 1},
        quality: {type: Number, default: 3},

        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    var Hero = exports.Hero = schema.define("hero", {
        level: {type: Number, default: 1},
        exp: {type: Number, default: 0},

        createTime: {type: Date, default: function () { return new Date(); }}
    });

    var Item = exports.Item = schema.define("item", {
        level: {type: Number, default: 0},
        exp: {type: Number, default: 0},

        createTime: {type: Date, default: function () { return new Date(); }}
    });

    var Stage = exports.Stage = schema.define("stage", {
        name: {type: String, default: ""}
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
    Role.hasMany(Hero, {as: "heroes", foreignKey: "owner"});
    Role.hasMany(Item, {as: "bag", foreignKey: "owner"});
    Hero.hasMany(Item, {as: "equipments", foreignKey: "bound"});
    Hero.belongsTo(HeroDef, {as: "def", foreignKey: "heroDefId"});
    Item.belongsTo(ItemDef, {as: "def", foreignKey: "itemDefId"});

    return schema;
};
