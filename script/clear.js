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


models.Role.destroyAll(function (err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    else {
        models.Item.destroyAll(function (err) {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            else {
                models.Hero.destroyAll(function (err) {
                    if (err) {
                        console.error(err);
                        process.exit(1);
                    }
                    else {
                        console.log("Data cleared.");
                        process.exit(0);
                    }
                });
            }
        });
    }
});
