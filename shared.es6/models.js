var db = require('jugglingdb');
var Promise = require('bluebird');
var r = require("rethinkdb");
var _ = require("underscore");
var moment = require("moment");

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

        team: {type: db.Schema.JSON, default: function () {return [null, null, null];}},

        energy: {type: Number, default: 0},
        coins: {type: Number, default: 0},
        golds: {type: Number, default: 0},
        contribs: {type: Number, default: 0},

        energyRefreshTime: {type: Date, default: function () { return new Date(); }},

        dailyRefreshData: {type: db.Schema.JSON, default: function () {return {};}},
        manualRefreshData: {type: db.Schema.JSON, default: function () {return {};}},

        createTime: {type: Date, default: function () { return new Date(); }},
        isNew: Boolean
    });

    var HeroDef = exports.HeroDef = schema.define("herodef", {
        name: {type: String, default: ""},
        resKey: {type: String, default: ""},
        male: {type: Boolean, default: false},
        stars: {type: Number, default: 1},
        maxLevel: {type: Number, default: 90},
        face: {type: String, default: ""},
        skill: {type: db.Schema.JSON, default: function () {return [];}},

        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    var ItemDef = exports.ItemDef = schema.define("itemdef", {
        type: {type: String, default: ""},
        name: {type: String, default: ""},
        resKey: {type: String, default: ""},

        price: {type: Number, default: 1000},
        levelReq: {type: Number, default: 1},
        quality: {type: Number, default: 3},

        destructCoeff: {type: db.Schema.JSON, default: function () {return [];}},
        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    var Hero = exports.Hero = schema.define("hero", {
        heroDefId: {type: Number, index: true},

        level: {type: Number, default: 1},
        exp: {type: Number, default: 0},

        createTime: {type: Date, default: function () { return new Date(); }}
    });

    var Item = exports.Item = schema.define("item", {
        bound: {type: String, index: true},
        itemDefId: {type: Number, index: true},

        level: {type: Number, default: 0},
        stoneUsed: {type: Number, default: 0},

        refinement: {type: Number, default: 0},
        refineProgress: {type: Number, default: 0},

        destructMemory: db.Schema.JSON,

        createTime: {type: Date, default: function () { return new Date(); }}
    });

    var Stage = exports.Stage = schema.define("stage", {
        name: {type: String, default: ""}
    });

    var Level = exports.Level = schema.define("level", {
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
    Stage.hasMany(Level, {as: "levels", foreignKey: "stageId"});

    Partition.prototype.toClientObj = function () {
        return _.pick(this, "id", "name");
    };

    User.prototype.toClientObj = function () {
        return _.pick(this, "id");
    };

    Role.prototype.toSessionObj = function () {
        return _.pick(this, "id", "name", "team", "level", "exp", "title", "dailyRefreshData", "manualRefreshData");
    };

    Role.prototype.toClientObj = function () {
        var ret = _.pick(this, "id", "name", "level", "exp", "title", "energy", "coins", "golds", "contribs");
        if (this.isNew) ret.isNew = 1;

        ret.team = _.map(this.team, (t) => { return t || ""; });

        return ret;
    };

    Role.prototype.toLogObj = function () {
        return _.pick(this, "id", "name", "level", "title", "coins", "golds");
    };

    Role.prototype.fillEnergy = function () {
        var now = moment();
        var lastCheck = moment(this.energyRefreshTime);
        var energyGain = Math.floor(moment.duration(now - lastCheck).asMinutes()/15);
        if (energyGain > 0) {
            this.energy = Math.max(this.energy + energyGain, 50);
            this.energyRefreshTime = lastCheck.add(energyGain*15, "minutes").toDate();
        }
    };

    Item.prototype.toClientObj = function () {
        return {
            id: this.id,
            defId: this.itemDefId,
            level: this.level,
            refinement: this.refinement,
            refineProgress: this.refineProgress,
            bound: this.bound || undefined
        };
    };

    Item.prototype.toLogObj = function () {
        return _.pick(this, "id", "itemDefId", "level", "refinement", "refineProgress", "bound");
    };

    Hero.prototype.toClientObj = function () {
        return {
            id: this.id,
            defId: this.heroDefId,
            level: this.level,
            exp: this.exp
        };
    };

    Hero.prototype.toLogObj = function () {
        return _.pick(this, "id", "heroDefId", "level", "exp");
    };

    return schema;
};
