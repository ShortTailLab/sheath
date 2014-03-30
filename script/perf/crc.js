#! /usr/bin/env node

var SSE4CRC32 = require("sse4_crc32"),
    js_crc32 = require("crc"),
    crc, start_time, end_time;


var TEST_BUFFER = "a5df64e6-6ab0-4a8f-857a-0b5a7f824f40",
    INVOCATIONS = 1000000;

console.log(INVOCATIONS + " calls to calculate CRC on a " + TEST_BUFFER.length + " byte buffer...");


// Test using SSE CRC32
start_time = Date.now();
for (var i = 0; i < INVOCATIONS; i++) {
    crc = SSE4CRC32.calculate(TEST_BUFFER);
}
end_time = Date.now();
console.log("\tSSE4.2 based CRC32: " + (end_time - start_time) + "ms.");


// Test using pure JS CRC32 (table-based)
start_time = Date.now();
for (var i = 0; i < INVOCATIONS; i++) {
    crc = js_crc32.crc32(TEST_BUFFER);
}
end_time = Date.now();
console.log("\tPure JS based CRC32 (table-based): " + (end_time - start_time) + "ms.");

