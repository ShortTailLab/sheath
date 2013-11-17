#! /usr/bin/env node

var program = require("commander");
var models = require("../shared/models");

program
    .version(require("../package.json").version)
    .option("-h, --host <host>", "connect to rethinkdb host", String, "localhost")
    .option("-p, --port <port>", "connect to rethinkdb port", Number, 28015)
    .option("-D, --database <name>", "create table structure in database", String, "sheath")
    .parse(process.argv);

models.init({
    host: program.host,
    port: program.port,
    database: program.database
});

models.schema.isActual(function (err, actual) {
    if (!actual) {
        models.schema.autoupdate(function (err, result) {
            if (err) {
                console.error("Auto updating schema failed, " + err);
                process.exit(1);
            }
            else {
                console.error("Auto updating completed, ");
                process.exit(0);
            }
        });
    }
    else {
        console.log("All models up to date.");
        process.exit(0);
    }
});
