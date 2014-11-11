#! /usr/bin/env node

function tryRequire(mod) {
	try {
		return require(mod);
	}
	catch (err) {
		return null;
	}
};

var route = "connector_entryHandler_enter";
var request = {
    accType: "main",
    username: "colprog",
    password: "sdsadfsadfsadfdafssadfdafsa",
    distro: "test",
    device: {
        os: "mac",
        device: "imac",
        clientVersion: "1.0",
        res: {
            width: 2560,
            height: 1440
        },
        osVersion: "10.9",
        mac: "000000000000",
        deviceID: ""
    }
};

var fs = require("fs");

var nodeProtobuf = tryRequire("node-protobuf");
if (nodeProtobuf) {
	var encoder = new nodeProtobuf(fs.readFileSync("../../game-server/config/clientProtos.desc"));
	var reqBin = encoder.serialize(request, route);
}

var bson = tryRequire("bson");
if (bson) {
	bson = bson.BSONPure.BSON;
	var reqBson = bson.serialize(request, false, true, false);
}

var protobuf = tryRequire('protocol-buffers');
if (protobuf) {
	var clientProtos = protobuf(fs.readFileSync("../../game-server/config/clientProtos.proto"));
	var reqProto = clientProtos[route].encode(request);
}

var reqStr = JSON.stringify(request);
var INVOCATIONS = 100000;

function testJsonSerialize() {
    var start = Date.now();
    for (var i=0;i<INVOCATIONS;i++) {
       JSON.stringify(request);
    }
    var end = Date.now();
	var dataBuf = JSON.stringify(request);
	console.log("Serialize " + INVOCATIONS + " reqeusts using Json : " + (end - start) + "ms. size=" + dataBuf.length + " bytes");
}

function testJsonDeSerialize() {
    var start = Date.now();
    for (var i=0;i<INVOCATIONS;i++) {
       JSON.parse(reqStr);
    }
    var end = Date.now();
    console.log("DeSerialize " + INVOCATIONS + " reqeusts using Json : " + (end - start) + "ms");
}

function testProtoSerialize() {
    var start = Date.now();
    for (var i=0;i<INVOCATIONS;i++) {
//        var Builder = encoderIO.build(route);
//        new Builder(request).encodeNB();
        encoder.serialize(request, route);
//        JSON.stringify(request);
    }
    var end = Date.now();
	console.log("Serialize " + INVOCATIONS + " reqeusts using node-protobuf : " + (end - start) + "ms. size=" + reqBin.length + " bytes");
}

function testProtoDeSerialize() {
    var start = Date.now();
    for (var i=0;i<INVOCATIONS;i++) {
        encoder.parse(reqBin, route);
    }
    var end = Date.now();
    console.log("DeSerialize " + INVOCATIONS + " reqeusts using node-protobuf : " + (end - start) + "ms");
}

function testBsonSerialize() {
    var start = Date.now();
    for (var i=0;i<INVOCATIONS;i++) {
       bson.serialize(request, false, true, false);
    }
    var end = Date.now();
	var dataBuf = bson.serialize(request);
	console.log("Serialize " + INVOCATIONS + " reqeusts using bson : " + (end - start) + "ms. size=" + dataBuf.length + " bytes");
}

function testBsonDeSerialize() {
    var start = Date.now();
    for (var i=0;i<INVOCATIONS;i++) {
       bson.deserialize(reqBson);
    }
    var end = Date.now();
    console.log("DeSerialize " + INVOCATIONS + " reqeusts using bson : " + (end - start) + "ms");
}

function testPBSerialize() {
    var start = Date.now();
	var encoder = clientProtos[route];
    for (var i=0;i<INVOCATIONS;i++) {
		encoder.encode(request);
    }
    var end = Date.now();
	var dataBuf = clientProtos[route].encode(request);
	console.log("Serialize " + INVOCATIONS + " reqeusts using protocol-buffers : " + (end - start) + "ms. size=" + dataBuf.length + " bytes");
}

function testPBDeSerialize() {
    var start = Date.now();
	var encoder = clientProtos[route];
    for (var i=0;i<INVOCATIONS;i++) {
       encoder.decode(reqProto);
    }
    var end = Date.now();
    console.log("DeSerialize " + INVOCATIONS + " reqeusts using protocol-buffers : " + (end - start) + "ms");
}

testJsonSerialize();
if (nodeProtobuf) testProtoSerialize();
if (bson) testBsonSerialize();
if (protobuf) testPBSerialize();

testJsonDeSerialize();
if (nodeProtobuf) testProtoDeSerialize();
if (bson) testBsonDeSerialize();
if (protobuf) testPBDeSerialize();
