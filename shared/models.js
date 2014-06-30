var thinky = require('thinky');
var Document = require("thinky/lib/document");
var Query = require("thinky/lib/query");
var perfFilter = require("../game-server/app/filters/perfStatsFilter");
var Promise = require('bluebird');
var _ = require("lodash");
var moment = require("moment");

exports.init = function (dbConfig) {
    var schema = exports.schema = thinky({
        min: dbConfig.poolMin,
        max: dbConfig.poolMax,
        host: dbConfig.host,
        port: dbConfig.port,
        db: dbConfig.database
    });
    var r = exports.r = schema.r;
    exports.Errors = schema.Errors;

    Document.prototype.toObject = function () {
        var copy = {};
        for(var key in this) {
            if (this.hasOwnProperty(key)) {
                copy[key] = this[key];
            }
        }
        return copy;
    };

    Query.prototype.oldExecute = Query.prototype._execute;
    Query.prototype._execute = function () {
        perfFilter.dbQueryStart(this);
        var self = this;
        return this.oldExecute.apply(this, arguments).then(function (results) {
            perfFilter.dbQueryEnd(self);
            return results;
        });
    };

    var levelUp = function levelUp (expTable, maxLevel) {
        var levelGain = 0;
        maxLevel = maxLevel || expTable.length - 1;
        while (true) {
            var nextLevelExp = expTable[this.level];
            if (this.exp < nextLevelExp || this.level >= maxLevel) break;
            this.level += 1;
            levelGain += 1;
            this.exp -= nextLevelExp;
        }
        return levelGain;
    };

    var User = exports.User = schema.createModel("user", {
        auth: [{type: String, id: String, password: String}],
        joinDate: {_type: Date, default: function () {return new Date();}},
        activated: {_type: Boolean, default: true},

        manRole: {admin: Boolean, editUser: Boolean, data: Boolean, announce: Boolean, debug: Boolean}
    });
    User.ensureIndex("auth", function (user) {
        return user("auth").map(function (auth) {
            return [auth("type"), auth("id")];
        });
    }, {multi: true});
    User.ensureIndex("authId", function (user) {
        return user("auth").map(function (auth) {
            return auth("id");
        });
    }, {multi: true});

    var Partition = exports.Partition = schema.createModel("partition", {
        name: {_type: String, default: ""},
        distro: {_type: String, default: "All"},
        public: {_type: Boolean, default: true},
        openSince: {_type: Date, default: function () {return new Date();}},

        createTime: {_type: Date, default: function () {return new Date();}}
    });

    var Role = exports.Role = schema.createModel("role", {
        name: {_type: String, default: ""},
        level: {_type: Number, default: 1},
        exp: {_type: Number, default: 0},
        title: {_type: String, default: ""},

        vip: {_type: Number, default: 0},
        spent: {_type: Number, default: 0},

//        formation: {_type: Number, default: 0},
//        formationLevel: {_type: Array, default: function () {return [0, 0, 0, 0, 0, 0];}},
        team: {_type: Array, default: function () {return [null, null, null];}},

        storageRoom: {_type: Number, default: 25},
        cleared: {_type: Object, default: function () {return {};}},

        energy: {_type: Number, default: 0},
        coins: {_type: Number, default: 0},
        golds: {_type: Number, default: 0},
        contribs: {_type: Number, default: 0},
        irons: {_type: Array, schema: Number, default: [0, 0, 0, 0]},

        energyRefreshTime: {_type: Date, default: function () {return new Date();}},
        dailyRefreshData: {_type: Object, default: function () {return {};}},
        manualRefreshData: {_type: Object, default: function () {return {};}},

        taskData: {_type: Object, default: function () {return {};}},
        taskDone: {_type: Array, default: function () {return [];}},
        taskClaimed: {_type: Array, default: function () {return [];}},

        store: {_type: Object, default: function () {return {};}},

        levelCleared: {_type: Object, default: function () {return {};}},
        levelGain: {_type: Object, default: function () {return {};}},

        souls: {_type: Object, default: function () {return {};}},

        createTime: {_type: Date, default: function () {return new Date();}},
        lastLogOff: {_type: Date, default: null},

        tutorial: Number
    });

    var HeroDef = exports.HeroDef = schema.createModel("herodef", {
        name: {_type: String, default: ""},
        type: {_type: String, default: ""},
        resKey: {_type: String, default: ""},
        stars: {_type: Number, default: 1},
        quality: {_type: Number, default: 1},
        skill: {_type: Number, default: 0},
        pSkill: {_type: Number, default: 0},
        souls: {_type: Number, default: 100},

        vitality: {_type: Number, default: 0},
        strength: {_type: Number, default: 0},
        intelligence: {_type: Number, default: 0},
        hp: {_type: Number, default: 0},
        hpGrowth: {_type: Number, default: 0},
        attack: {_type: Number, default: 0},
        attackGrowth: {_type: Number, default: 0},
        magic: {_type: Number, default: 0},
        magicGrowth: {_type: Number, default: 0},
        defense: {_type: Number, default: 0},
        defenseGrowth: {_type: Number, default: 0},
        resist: {_type: Number, default: 0},
        resistGrowth: {_type: Number, default: 0},
        critical: {_type: Number, default: 0},
        interval: {_type: Number, default: 0},
        attackSpeed: {_type: Number, default: 0},
        speed: {_type: Number, default: 0},
        ballLev: {_type: Number, default: 0},
        secBallLev: {_type: Number, default: 0},
        hpRefine: {_type: Array, default: function () {return [];}},
        attackRefine: {_type: Array, default: function () {return [];}},
        magicRefine: {_type: Array, default: function () {return [];}},
        defenseRefine: {_type: Array, default: function () {return [];}},
        resistRefine: {_type: Array, default: function () {return [];}},
        refineStars: {_type: Array, default: function () {return [];}},

        attackDelta: {_type: Array, default: function () {return [];}},
        damage: {_type: Number, default: 0},
        damageReduction: {_type: Number, default: 0},
        damageFactor: {_type: Number, default: 0},
        damageRedFactor: {_type: Number, default: 0},
        physicalResist: {_type: Number, default: 0},
        magicResist: {_type: Number, default: 0},
        attackFactor: {_type: Number, default: 0},
        defenseFactor: {_type: Number, default: 0}
    });

    var ItemDef = exports.ItemDef = schema.createModel("itemdef", {
        name: {_type: String, default: ""},
        quality: {_type: Number, default: 3},
        type: {_type: String, default: ""},
        subType: {_type: String, default: ""},
        resKey: {_type: String, default: ""},
        levelReq: {_type: Number, default: 1},

        stackSize: {_type: Number, default: 1},

        composable: {_type: Boolean, default: true},
        composeCount: {_type: Number, default: 1},
        composeTarget: {_type: Array, default: function () {return [];}},

        canSell: {_type: Boolean, default: true},
        price: {_type: Number, default: 1000},

        useTarget: {_type: Number, default: 0},
        itemEffect: {_type: Array, default: function () {return [];}},

        extended: {_type: Object, default: function () {return {};}},
        desc: {_type: String, default: ""}
    });

    var EquipmentDef = exports.EquipmentDef = schema.createModel("equipmentdef", {
        name: {_type: String, default: ""},
        desc: {_type: String, default: ""},
        color: {_type: Number, default: 1},
        level: {_type: Number, default: 1},
        quality: {_type: Number, default: 0},
        counts: {_type: Number, default: 0},
        type: {_type: String, default: ""},
        resKey: {_type: String, default: ""},

        hp: {_type: Number, default: 0},
        attack: {_type: Number, default: 0},
        defense: {_type: Number, default: 0},
        iron: {_type: Number, default: 0},

        hpGrowth: {_type: Number, default: 0},
        attackGrowth: {_type: Number, default: 0},
        defenseGrowth: {_type: Number, default: 0},
        growFactor: {_type:Number, default: 0},

        hpRefine: {_type: Number, default: 0},
        attackRefine: {_type: Number, default: 0},
        defenseRefine: {_type: Number, default: 0},
        refineFactor: {_type:Number, default: 0}
    });

    var Hero = exports.Hero = schema.createModel("hero", {
        heroDefId: {_type: Number},

        stars: {_type: Number, default: 0},
        level: {_type: Number, default: 1},
        exp: {_type: Number, default: 0},

        createTime: {_type: Date, default: function () {return new Date();}}
    });

    var Item = exports.Item = schema.createModel("item", {
        itemDefId: {_type: Number},

        level: {_type: Number, default: 1},
        stoneUsed: {_type: Number, default: 0},
        refinement: {_type: Number, default: 0},
        luck: Number,

        createTime: {_type: Date, default: function () {return new Date();}}
    });

    var Level = exports.Level = schema.createModel("level", {
        name: {_type: String, default: ""},
        path: {_type: String, default: ""},
        energy: {_type: Number, default: 0},
        roleExp: {_type: Number, default: 0},
        heroExp: {_type: Number, default: 0},
        stageId: {_type: Number, default: 0},
        stage: {_type: String, default: ""},
        enemies: {_type: Array, default: function () { return []; }},
        enabled: {_type: Boolean, default: false},
        requirement: {_type: Number, default: 0},
        min_level: {_type: Number, default: 0},
        drop_items: {_type: Array, default: function () {return [];}}
    });

    var StoreItem = exports.StoreItem = schema.createModel("storeitem", {
        name: {_type: String, default: ""},
        gold: {_type: Boolean, default: false},
        price: {_type: Number, default: 0},
        defId: {_type: Number, default: 0},
        isSoul: {_type: Boolean, default: false},
        count: {_type: Number, default: 1},
        weight: {_type: Number, default: 0}
    });

    var Treasure = exports.Treasure = schema.createModel("treasure", {
        type: String,
        count: Number,
        candidates: {_type: Array, default: function () { return []; }},
        weights: {_type: Array, default: function () { return []; }}
    });

    var Task = exports.Task = schema.createModel("task", {
        prevTask: {_type: Number, default: 0},
        type: {_type: Number, default: 0},
        name: {_type: String, default: ""},
        desc: {_type: String, default: ""},

        start: {_type: Date, default: function () {return new Date();}},
        end: {_type: Date, default: function () {return new Date();}},

        preCondition: {_type: Array, default: function () { return []; }},
        condition: {_type: Array, default: function () { return []; }},

        reward: Number
    });

    var HeroDraw = exports.HeroDraw = schema.createModel("herodraw", {
        itemId: Number,
        isSoul: {_type: Boolean, default: false},

        coinWeight: {_type: Number, default: 1},
        goldWeight: {_type: Number, default: 1},

        paidCoinWeight: {_type: Number, default: 1},
        paidGoldWeight: {_type: Number, default: 1},

        tenCoinWeight: {_type: Number, default: 1},
        tenGoldWeight: {_type: Number, default: 1},

        level: {_type: Number, default: 1},
        count: {_type: Number, default: 1}
    });

    var DrawNode = exports.DrawNode = schema.createModel("drawnode", {
        weight: {_type: Number, default: 0}
    });

    var Mail = exports.Mail = schema.createModel("mail", {
        sender: String,
        target: String,
        text: {_type: String, default: ""},
        time: {_type: Date, default: function () {return new Date();}},
        read: {_type: Boolean, default: false},
        claimed: {_type: Boolean, default: false},
        treasures: {_type: Array, default: function () { return []; }}
    });
    Mail.ensureIndex("sender");
    Mail.ensureIndex("target");
    Mail.ensureIndex("time");

    var Announcement = exports.Announcement = schema.createModel("announcement", {
        name: String,
        content: String,
        partitions: {_type: Array, default: function () { return []; }},
        start: {_type: Date, default: function () {return new Date();}},
        end: {_type: Date, default: function () {return new Date();}}
    });

    var PurchaseLog = exports.PurchaseLog = schema.createModel("purchaselog", {
        role: String,
        channelName: String,
        state: {_type: Number, default: 0},
        time: {_type: Date, default: function () {return new Date();}},

        golds: Number,
        price: Number,
        extraParams: {_type: Object, default: function () { return {}; }}
    });

    var Device = exports.Device = schema.createModel("device", {
        os: {_type: String, default: ""},
        osVersion: {_type: String, default: ""},
        clientVersion: {_type: String, default: ""},
        deviceName: {_type: String, default: ""},

        lastRole: {_type: String},
        lastLogin: {_type: Date, default: function () {return new Date();}}
    });
    Device.ensureIndex("lastRole");

    var MarketingCode = exports.MarketingCode = schema.createModel("marketingcode", {
        treasures: {_type: Array, default: function () { return []; }},
        roles: {_type: Array, schema: Number, default: function () {return [];}},
        max: {_type: Number, default: 1},
        expire: {_type: Date, default: new Date(2020, 11, 31)},
        lastClaimed: Date
    });

    var Log = exports.Log = schema.createModel("log", {
        severity: String,
        type: String,
        time: Date,
        server: String,
        msg: Object
    });
    Log.ensureIndex("type_time", function (stat) {
        return [stat("type"), stat("time")];
    });

    var Stat = exports.Stat = schema.createModel("stat", {
        cycle: String,
        type: String,
        time: Date,
        value: Number
    });
    Stat.ensureIndex("time");

    // relations should be used mostly in web server
    Partition.hasMany(Role, "roles", "id", "partition");
    User.hasMany(Role, "roles", "id", "owner");
    Role.hasMany(Hero, "heroes", "id", "owner");
    Role.hasMany(Item, "bag", "id", "owner");
    Hero.hasMany(Item, "equipments", "id", "bound");

    Partition.define("toClientObj", function () {
        var ret = _.pick(this, "id", "name");
        ret.openSince = +this.openSince;
        return ret;
    });

    User.define("toClientObj", function () {
        return _.pick(this, "id");
    });

    Role.define("toSessionObj", function () {
        var ret = _.pick(this, "id", "name", "team", "level", "exp", "title", "dailyRefreshData", "manualRefreshData", "partition", "tutorial");
        ret.storageRoom = this.getStorageRoom();
        return ret;
    });

    Role.define("toClientObj", function () {
        var ret = _.pick(this, "id", "name", "level", "vip", "exp", "title", "energy", "coins", "golds", "contribs", "irons", "tutorial");
        ret.team = _.map(this.team, function (t) { return t || ""; });
        ret.storageRoom = this.getStorageRoom();

        return ret;
    });

    Role.define("toSlimClientObj", function () {
        var ret = _.pick(this, "id", "name", "level", "vip", "exp", "title", "energy", "coins", "golds", "contribs", "irons", "tutorial");
        ret.team = _.map(this.team, function (t) { return t || ""; });
        ret.storageRoom = this.getStorageRoom();

        return ret;
    });

    Role.define("toLogObj", function () {
        return _.pick(this, "id", "name", "level", "title", "coins", "golds", "irons", "vip");
    });

    Role.define("getStorageRoom", function () {
        return this.storageRoom;
    });

//    Role.define("setTeam", function (formation, hids) {
//        while (this.team.length < 30) {
//            this.team.push(null);
//        }
//        for (var i= 0, len=Math.min(5, hids.length);i<len;i++) {
//            this.team[formation*5+i] = hids[i];
//        }
//    });

    Role.define("fillEnergy", function (energyTable) {
        var now = moment();
        var lastCheck = moment(this.energyRefreshTime);
        var energyGain = Math.floor(moment.duration(now - lastCheck).asMinutes()/15);
        var maxEnergy = energyTable.maxEnergy[Math.min(this.level, energyTable.maxEnergy.length-1)];
        if (energyGain > 0) {
            this.energy = Math.max(this.energy, Math.min(this.energy + energyGain, maxEnergy));
            this.energyRefreshTime = lastCheck.add(energyGain*15, "minutes").toDate();
        }
    });

    Role.define("levelUp", levelUp);

    ItemDef.define("toClientObj", function () {
        var ret = this.toObject();
        _.extend(ret, ret.extended);
        ret.extended = undefined;
        ret.itemEffect = {name: ret.itemEffect[0], amount: ret.itemEffect[1]};
        return ret;
    });

    EquipmentDef.define("toClientObj", function () {
        return this.toObject();
    });

    HeroDef.define("toClientObj", function () {
        return this.toObject();
    });

    Item.define("toClientObj", function () {
        return {
            id: this.id,
            defId: this.itemDefId,
            level: this.level,
            refinement: this.refinement,
            bound: this.bound || undefined
        };
    });

    Item.define("toLogObj", function () {
        return _.pick(this, "id", "itemDefId", "level", "refinement", "bound");
    });

    Hero.define("toClientObj", function () {
        return {
            id: this.id,
            defId: this.heroDefId,
            stars: this.stars,
            level: this.level,
            exp: this.exp
        };
    });

    Hero.define("toLogObj", function () {
        return _.pick(this, "id", "heroDefId", "stars", "level", "exp");
    });

    Hero.define("levelUp", levelUp);

    Level.define("toClientObj", function () {
        return _.pick(this, "id", "name", "path", "energy", "exp");
    });

    Mail.define("toClientObj", function () {
        var ret = this.toObject(true);
        ret.time = +ret.time;
        return ret;
    });

    Mail.define("toLogObj", function () {
        return _.pick(this, "id");
    });

    Task.define("toClientObj", function () {
        var ret = {
            id: this.id,
            name: this.name,
            description: this.desc
        };
        if (this.start) ret.start = +this.start;
        if (this.end) ret.end = +this.end;
        return ret;
    });

    Announcement.define("toClientObj", function () {
        var ret = _.pick(this, "id", "name", "content", "start", "end");
        ret.start = +ret.start;
        ret.end = +ret.end;
        return ret;
    });

    return schema;
};
