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

        manRole: {type: db.Schema.JSON}
    }, {
        auth: {index: true, indexOption: {multi: true}, indexFunction: function (user) {
            return user("auth").map(function (auth) {
                return [auth("type"), auth("id")];
            });
        }},
        authId: {index: true, indexOption: {multi: true}, indexFunction: function (user) {
            return user("auth").map(function (auth) {
                return auth("id");
            });
        }}
    });

    var Partition = exports.Partition = schema.define("partition", {
        name: {type: String, default: ""},
        distro: {type: String, default: "All"},
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
        spent: {type: Number, default: 0},

        team: {type: db.Schema.JSON, default: function () {return [null, null, null];}},
        storageRoom: {type: Number, default: 25},
        cleared: {type: db.Schema.JSON, default: function () {return {};}},

        energy: {type: Number, default: 0},
        coins: {type: Number, default: 0},
        golds: {type: Number, default: 0},
        contribs: {type: Number, default: 0},

        energyRefreshTime: {type: Date, default: function () { return new Date(); }},
        dailyRefreshData: {type: db.Schema.JSON, default: function () {return {};}},

        taskData: {type: db.Schema.JSON, default: function () {return {};}},

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

        canEquip: {type: db.Schema.JSON, default: function () {return [];}},

        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    var ItemDef = exports.ItemDef = schema.define("itemdef", {
        type: {type: String, default: ""},
        name: {type: String, default: ""},
        resKey: {type: String, default: ""},

        price: {type: Number, default: 1000},
        levelReq: {type: Number, default: 1},
        quality: {type: Number, default: 3},

        stackSize: {type: Number, default: 1},

        destructCoeff: {type: db.Schema.JSON, default: function () {return [];}},
        props: {type: db.Schema.JSON, default: function () {return [];}}
    });

    var Ballistic = exports.Ballistic = schema.define("ballistic", {
        value: String
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
        name: {type: String, default: ""},
        resKey: {type: String, default: ""},

        public: {type: Boolean, default: true}
    });

    var Treasure = exports.Treasure = schema.define("treasure", {
        type: String,
        count: Number,
        desc: {type: String, default: ""},
        candidates: {type: db.Schema.JSON, default: function () { return []; }},
        weights: {type: db.Schema.JSON, default: function () { return []; }}
    });

    var Task = exports.Task = schema.define("task", {
        name: {type: String, default: ""},

        preCond: {type: String, default: ""},
        script: {type: String, default: ""},
        params: {type: db.Schema.JSON, default: function () { return {}; }},

        reward: Number
    });

    var Mail = exports.Mail = schema.define("mail", {
        sender: {type: String, index: true},
        target: {type: String, index: true},
        text: {type: String, default: ""},
        time: {type: Date, index: true, default: function () { return new Date(); }},
        read: {type: Boolean, default: false},
        claimed: {type: Boolean, default: false},
        treasures: {type: db.Schema.JSON, default: function () { return []; }}
    });

    var Log = exports.Log = schema.define("log", {
        severity: String,
        type: String,
        time: {type: Date, index: true},
        server: String,
        msg: Object
    }, {
        type_time: {index: true, indexFunction: function (stat) {
            return [stat("type"), stat("time")];
        }}
    });

    var Stat = exports.Stat = schema.define("stat", {
        cycle: String,
        type: String,
        time: {type: Date, index: true},
        value: Number
    }, {
        cycle_type: {index: true, indexFunction: function (stat) {
            return [stat("cycle"), stat("type")];
        }}
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

    Partition.prototype.toLogObj = function () {
        return _.pick(this, "id", "name");
    };

    User.prototype.toClientObj = function () {
        return _.pick(this, "id");
    };

    Role.prototype.toSessionObj = function () {
        return _.pick(this, "id", "name", "team", "level", "exp", "title", "storageRoom", "dailyRefreshData", "manualRefreshData", "partition");
    };

    Role.prototype.toClientObj = function () {
        var ret = _.pick(this, "id", "name", "level", "exp", "title", "storageRoom", "energy", "coins", "golds", "contribs");
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

    ItemDef.prototype.toClientObj = function () {
        return _.pick(this, "id", "type", "name", "resKey", "price", "levelReq", "quality", "stackSize");
    };

    HeroDef.prototype.toClientObj = function () {
        var ret = _.pick(this, "id", "name", "resKey", "stars", "maxLevel");
        if (this.male) {
            ret.male = 1;
        }
        else {
            ret.male = 0;
        }

        return ret;
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

    Mail.prototype.toClientObj = function () {
        var ret = this.toObject(true);
        ret.time = +ret.time;
        return ret;
    };

    Mail.prototype.toLogObj = function () {
        return _.pick(this, "id");
    };

    return schema;
};
