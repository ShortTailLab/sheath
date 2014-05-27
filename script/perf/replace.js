#! /usr/bin/env node

var start_time, end_time;


var TEST_BUFFER = "game.roleHandler.claimDailyReward",
    INVOCATIONS = 1000000;

console.log(INVOCATIONS + " calls to global replace string on " + TEST_BUFFER.length + " byte buffer...");


function test1() {
    var route = TEST_BUFFER.replace(/\./g, "_");
}

var tableCache = {};
function test2() {
    var exists = tableCache[TEST_BUFFER];
    if (exists === undefined) {
        var route = TEST_BUFFER.replace(/\./g, "_");
        exists = tableCache[TEST_BUFFER] = true;
    }
}


start_time = Date.now();
for (var i = 0; i < INVOCATIONS; i++) {
    test1();
}
end_time = Date.now();
console.log("\ttest everytime: " + (end_time - start_time) + "ms.");


// Test using pure JS CRC32 (table-based)
start_time = Date.now();
for (var i = 0; i < INVOCATIONS; i++) {
    test2();
}
end_time = Date.now();
console.log("\ttable cache: " + (end_time - start_time) + "ms.");

