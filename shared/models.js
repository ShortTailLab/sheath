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

        formation: {type: Number, default: 0},
        formationLevel: {type: db.Schema.JSON, default: function () {return [0, 0, 0, 0, 0, 0];}},
        team: {type: db.Schema.JSON, default: function () {var ret = new Array(30); for(var i=0;i<30;i++) ret[i]=null; return ret;}},

        storageRoom: {type: Number, default: 25},
        cleared: {type: db.Schema.JSON, default: function () {return {};}},

        energy: {type: Number, default: 0},
        coins: {type: Number, default: 0},
        golds: {type: Number, default: 0},
        contribs: {type: Number, default: 0},

        energyRefreshTime: {type: Date, default: function () { return new Date(); }},
        dailyRefreshData: {type: db.Schema.JSON, default: function () {return {};}},

        taskData: {type: db.Schema.JSON, default: function () {return {};}},
        taskDone: {type: db.Schema.JSON, default: function () {return [];}},
        taskClaimed: {type: db.Schema.JSON, default: function () {return [];}},

        store: {type: db.Schema.JSON, default: function () {return {};}},
        bar: {type: db.Schema.JSON, default: function () {return {};}},

        levelCleared: {type: db.Schema.JSON, default: function () {return {};}},
        levelGain: {type: db.Schema.JSON, default: function () {return {};}},

        createTime: {type: Date, default: function () { return new Date(); }},
        lastLogOff: Date,
        isNew: Boolean
    });

    var HeroDef = exports.HeroDef = schema.define("herodef", {
        name: {type: String, default: ""},
        type: {type: String, default: ""},
        resKey: {type: String, default: ""},
        stars: {type: Number, default: 1},
        skill: {type: Number, default: 0},

        vitality: {type: Number, default: 0},
        strength: {type: Number, default: 0},
        intelligence: {type: Number, default: 0},
        hp: {type: Number, default: 0},
        attack: {type: Number, default: 0},
        magic: {type: Number, default: 0},
        defense: {type: Number, default: 0},
        resist: {type: Number, default: 0},
        attackDelta: {type: db.Schema.JSON, default: function () {return {};}},
        vitGrowth: {type: Number, default: 0},
        strGrowth: {type: Number, default: 0},
        intelGrowth: {type: Number, default: 0},
        critical: {type: Number, default: 0},
        interval: {type: Number, default: 0},
        attackSpeed: {type: Number, default: 0},
        speed: {type: Number, default: 0},
        secBallLev: {type: Number, default: 0},
        ballLev: {type: Number, default: 0},
        ice: {type: Number, default: 0},
        fire: {type: Number, default: 0},
        slow: {type: Number, default: 0},
        weak: {type: Number, default: 0},
        damage: {type: Number, default: 0},
        damageReduction: {type: Number, default: 0},
        damageFactor: {type: Number, default: 0},
        damageRedFactor: {type: Number, default: 0},
        physicalResist: {type: Number, default: 0},
        magicResist: {type: Number, default: 0},
        attackFactor: {type: Number, default: 0},
        defenseFactor: {type: Number, default: 0}
    });

    var ItemDef = exports.ItemDef = schema.define("itemdef", {
        name: {type: String, default: ""},
        quality: {type: Number, default: 3},
        type: {type: String, default: ""},
        subType: {type: String, default: ""},
        resKey: {type: String, default: ""},
        levelReq: {type: Number, default: 1},

        stackSize: {type: Number, default: 1},

        composable: {type: Boolean, default: true},
        composeCount: {type: Number, default: 1},
        composeTarget: {type: db.Schema.JSON, default: function () {return [];}},

        canSell: {type: Boolean, default: true},
        price: {type: Number, default: 1000},

        desc: {type: String, default: ""}
    });

    var EquipmentDef = exports.EquipmentDef = schema.define("equipmentdef", {
        name: {type: String, default: ""},
        quality: {type: Number, default: 3},
        type: {type: String, default: ""},
        subType: {type: String, default: ""},
        resKey: {type: String, default: ""},
        levelReq: {type: Number, default: 1},

        hp: {type: Number, default: 0},
        attack: {type: Number, default: 0},
        magic: {type: Number, default: 0},
        defense: {type: Number, default: 0},
        resist: {type: Number, default: 0},
        ballLev: {type: Number, default: 0},
        attackSpeed: {type: Number, default: 0},
        critical: {type: Number, default: 0},
        hpP: {type: Number, default: 0},
        attackP: {type: Number, default: 0},
        magicP: {type: Number, default: 0},
        defenseP: {type: Number, default: 0},
        resistP: {type: Number, default: 0},

        ice: {type: Number, default: 0},
        fire: {type: Number, default: 0},
        slow: {type: Number, default: 0},
        weak: {type: Number, default: 0},

        upgradeGrowth: {type: String},
        upgradeCost: {type:Number, default: 0},

        refineGrowth: {type: String},
        refineLevel: {type: Number, default: 0},
        refineCost: {type: db.Schema.JSON, default: function () {return [];}},

        slots: {type: Number, default: 0},
        gemType: {type: db.Schema.JSON, default: function () {return [];}},

        price: {type: Number, default: 0},
        destructPiece: {type: db.Schema.JSON, default: function () {return [];}},
        destructRefine: {type: db.Schema.JSON, default: function () {return [];}}
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

        level: {type: Number, default: 1},
        stoneUsed: {type: Number, default: 0},

        refinement: {type: Number, default: 0},
        refineProgress: {type: Number, default: 0},

        destructMemory: db.Schema.JSON,

        createTime: {type: Date, default: function () { return new Date(); }}
    });

    var Stage = exports.Stage = schema.define("stage", {
        name: {type: String, default: ""},

        public: {type: Boolean, default: true}
    });

    var Level = exports.Level = schema.define("level", {
        name: {type: String, default: ""},
        path: {type: String, default: ""},
        energy: {type: Number, default: 0},
        exp: {type: Number, default: 0},
        stageId: {type: Number, default: 0},
        stage: {type: String, default: ""},
        enemies: {type: db.Schema.JSON, default: function () { return []; }}
    });

    var StoreItem = exports.StoreItem = schema.define("storeitem", {
        name: {type: String, default: ""},
        gold: {type: Boolean, default: false},
        price: {type: Number, default: 0},
        defId: {type: Number, default: 0},
        count: {type: Number, default: 1},
        desc: {type: String, default: ""}
    });

    var Treasure = exports.Treasure = schema.define("treasure", {
        type: String,
        count: Number,
        desc: {type: String, default: ""},
        candidates: {type: db.Schema.JSON, default: function () { return []; }},
        weights: {type: db.Schema.JSON, default: function () { return []; }}
    });

    var Task = exports.Task = schema.define("task", {
        type: {type: Number, default: 0},
        level: {type: Number, default: 0},
        name: {type: String, default: ""},
        desc: {type: String, default: ""},
        weight: {type: Number, default: 0},

        start: {type: Date, default: function () { return new Date(); }},
        end: {type: Date, default: function () { return new Date(); }},

        preCondition: {type: db.Schema.JSON, default: function () { return []; }},
        condition: {type: db.Schema.JSON, default: function () { return []; }},

        reward: Number
    });

    var HeroDraw = exports.HeroDraw = schema.define("herodraw", {
        sysWeight: {type: Number, default: 0},
        freeWeight: {type: Number, default: 0},
        paidWeight: {type: Number, default: 0},
        golds: {type: Number, default: 0},
        contribs: {type: Number, default: 0},
        level: {type: Number, default: 1}
    });

    var HeroNode = exports.HeroNode = schema.define("heronode", {
        weight: {type: Number, default: 0}
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

    var Announcement = exports.Announcement = schema.define("announcement", {
        name: String,
        content: String,
        partitions: {type: db.Schema.JSON, default: function () { return []; }},
        start: {type: Date, default: function () { return new Date(); }},
        end: {type: Date, default: function () { return new Date(); }}
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
        var ret = _.pick(this, "id", "name", "team", "level", "exp", "title", "dailyRefreshData", "manualRefreshData", "partition");
        ret.storageRoom = this.getStorageRoom();
        return ret;
    };

    Role.prototype.toClientObj = function () {
        var ret = _.pick(this, "id", "name", "level", "exp", "title", "energy", "coins", "golds", "contribs", "formation", "formationLevel");
        if (this.isNew) ret.isNew = true;
        ret.team = _.map(this.team, function (t) { return t || ""; });
        ret.storageRoom = this.getStorageRoom();

        return ret;
    };

    Role.prototype.toLogObj = function () {
        return _.pick(this, "id", "name", "level", "title", "coins", "golds");
    };

    Role.prototype.getStorageRoom = function () {
        return this.storageRoom;
    };

    Role.prototype.setTeam = function (formation, hids) {
        while (this.team.length < 30) {
            this.team.push(null);
        }
        for (var i= 0, len=Math.min(5, hids.length);i<len;i++) {
            this.team[formation*5+i] = hids[i];
        }
    };

    Role.prototype.fillEnergy = function () {
        var now = moment();
        var lastCheck = moment(this.energyRefreshTime);
        var energyGain = Math.floor(moment.duration(now - lastCheck).asMinutes()/15);
        if (energyGain > 0) {
            this.energy = Math.min(this.energy + energyGain, 50);
            this.energyRefreshTime = lastCheck.add(energyGain*15, "minutes").toDate();
        }
    };

    ItemDef.prototype.toClientObj = function () {
        return this.toObject();
    };

    EquipmentDef.prototype.toClientObj = function () {
        return this.toObject();
    };

    HeroDef.prototype.toClientObj = function () {
        return this.toObject(true);
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

    Level.prototype.toClientObj = function () {
        return _.pick(this, "id", "name", "path", "energy", "exp");
    };

    Mail.prototype.toClientObj = function () {
        var ret = this.toObject(true);
        ret.time = +ret.time;
        return ret;
    };

    Mail.prototype.toLogObj = function () {
        return _.pick(this, "id");
    };

    Task.prototype.toClientObj = function () {
        var ret = {
            id: this.id,
            name: this.name,
            description: this.desc
        };
        if (this.start) ret.start = +this.start;
        if (this.end) ret.end = +this.end;
        return ret;
    };

    Announcement.prototype.toClientObj = function () {
        var ret = _.pick(this, "id", "name", "content", "start", "end");
        ret.start = +ret.start;
        ret.end = +ret.end;
        return ret;
    };

    return schema;
};
