#! /usr/bin/env node

var snappy = require("snappy");
var fs = require("fs");
var zlib = require("zlib");
var Promise = require("bluebird");

var uData = fs.readFileSync("../../game-server/config/serverProtos.fbs");
var start_time, end_time;
var INVOCATIONS = 50000;

var snappyData, gzipData;

console.log(INVOCATIONS + " calls to compress data of size " + uData.length / 1024 + "kB ...");


// Test using zlib
function testGzipCompress(cb) {
	var CALL_DONE = 0;
	start_time = Date.now();
	for (var i = 0; i < INVOCATIONS; i++) {
	    zlib.gzip(uData, function (err, compressed) {
			if (err) {
				console.log(err);
			}
	    	++CALL_DONE;
			if (CALL_DONE === INVOCATIONS) {
				end_time = Date.now();
				console.log("\tcompress using gzip: " + (end_time - start_time) + "ms. file size: " + compressed.length / 1024 + " kB, compress ratio: " + compressed.length / uData.length * 100 + "%");
				gzipData = compressed;
				cb();
			}
	    });
	}
}

function testGzipDeCompress(cb) {
	var CALL_DONE = 0;
	start_time = Date.now();
	for (var i = 0; i < INVOCATIONS; i++) {
	    zlib.gunzip(gzipData, function (err, decompressed) {
			if (err) {
				console.log(err);
			}
	    	++CALL_DONE;
			if (CALL_DONE === INVOCATIONS) {
				end_time = Date.now();
				console.log("\tdecompress using gzip: " + (end_time - start_time) + "ms. ");
				cb();
			}
	    });
	}
}


// Test using snappy
function testSnappyCompress(cb) {
	var CALL_DONE = 0;
	start_time = Date.now();
	for (var i = 0; i < INVOCATIONS; i++) {
	    snappy.compress(uData, function (err, compressed) {
			if (err) {
				console.log(err);
			}
	    	++CALL_DONE;
			if (CALL_DONE === INVOCATIONS) {
				end_time = Date.now();
				console.log("\tcompress using snappy: " + (end_time - start_time) + "ms. file size: " + compressed.length / 1024 + " kB, compress ratio: " + compressed.length / uData.length * 100 + "%");
				snappyData = compressed;
				cb();
			}
	    });
	}
}

function testSnappyDeCompress(cb) {
	var CALL_DONE = 0;
	start_time = Date.now();
	for (var i = 0; i < INVOCATIONS; i++) {
	    snappy.uncompress(snappyData, function (err, decompressed) {
			if (err) {
				console.log(err);
			}
	    	++CALL_DONE;
			if (CALL_DONE === INVOCATIONS) {
				end_time = Date.now();
				console.log("\tdecompress using snappy: " + (end_time - start_time) + "ms. ");
				cb();
			}
	    });
	}
}

testSnappyCompress(function () {
	testSnappyDeCompress(function () {
		testGzipCompress(function (){
			testGzipDeCompress(function (){
		
			})
		})
	})
})
