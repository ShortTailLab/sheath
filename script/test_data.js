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


models.HeroDef.create(hDefs, function (err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    else {
        console.log("Test data filled.");
        process.exit(0);
    }
});
