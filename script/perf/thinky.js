#! /usr/bin/env node

require("../../shared/traceurBootstrap");
var models = require("../../shared/models");

models.init({
    host: "db0.stl.com",
    port: 28015,
    database: "test"
});

var uData = {"activated":true,"auth":[{"id":"colprog","password":"$2a$05$UfzzeO2S/.T3S3uYvLL/juC1z6Yb2AKR0f0iuBWpvG.1vmvdbTZBG","type":"main"}],"id":"51188089-a981-48fb-9a71-35eeeffc9ec2","joinDate":{"$reql_type$":"TIME","epoch_time":1400127920.372,"timezone":"+00:00"},"manRole":{"admin":true,"announce":true,"data":true,"debug":true,"editUser":true}};
var start_time, end_time;
var INVOCATIONS = 30000;

console.log(INVOCATIONS + " calls to parse a single document...");


start_time = Date.now();
for (var i = 0; i < INVOCATIONS; i++) {
    models.User._parse(uData);
}
end_time = Date.now();
console.log("\tparse single doc: " + (end_time - start_time) + "ms.");
process.exit(0);
