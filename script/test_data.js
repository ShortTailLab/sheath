#! /usr/bin/env node

var program = require("commander");
var models = require("../shared/models");
var jugglingdb = require("jugglingdb");

program
    .version(require("../package.json").version)
    .option("-h, --host <host>", "connect to rethinkdb host", String, "localhost")
    .option("-p, --port <port>", "connect to rethinkdb port", Number, 28015)
    .option("-D, --database <name>", "create table structure in database", String, "sheath")
    .parse(process.argv);


var hDefs = [
    {
        id: 1,
        name: "刘备",
        male: true,
        stars: 3
    },
    {
        id: 2,
        name: "关羽",
        male: true,
        stars: 5
    },
    {
        id: 3,
        name: "张飞",
        male: true,
        stars: 5
    },
    {
        id: 4,
        name: "貂蝉",
        male: false,
        stars: 4
    }
];

var itemDefs = [
    {
        id: 100,
        name: "强化石",
        type: "STONE",
        stars: 3
    },
    {
        id: 101,
        name: "青龙偃月刀",
        type: "WE_R_BLADE",
        stars: 5
    },
    {
        id: 102,
        name: "紫金靴",
        type: "AR_F_BOOT",
        stars: 5
    },
    {
        id: 111,
        name: "精品武器碎片",
        type: "WEP",
        stars: 5
    },
    {
        id: 112,
        name: "精品防具碎片",
        type: "ARP",
        stars: 5
    },
    {
        id: 122,
        name: "橙宝石",
        type: "GEM_ORANGE",
        stars: 4
    }
];

jugglingdb.AbstractClass._forDB = function (data) {
    var res = {};
    Object.keys(data).forEach(function (propName) {
        var typeName = this.whatTypeName(propName);
        if (!typeName && !data[propName] instanceof Array) {
            return;
        }
        else {
            res[propName] = data[propName];
        }
    }.bind(this));
    return res;
};

models.init({
    host: program.host,
    port: program.port,
    database: program.database
}).connect();

models.HeroDef.destroyAll(function (err) {
    models.ItemDef.destroyAll(function (err) {
        doWork();
    });
});

var doWork = function () {
    models.HeroDef.create(hDefs, function (err) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        else {
            models.ItemDef.create(itemDefs, function (err) {
                if (err) {
                    console.error(err);
                    process.exit(1);
                }
                else {
                    console.log("Test data filled.");
                    process.exit(0);
                }
            });
        }
    });
};
