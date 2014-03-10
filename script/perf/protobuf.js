#! /usr/bin/env node

var request = {
    accType: "main",
    username: "colprog",
    password: "sdsadfsadfsadfdafssadfdafsa",
    distro: "test",
    device: {
        os: "mac",
        device: "imac",
        res: {
            width: 2560,
            height: 1440
        },
        osVersion: "10.9",
        mac: "000000000000",
        deviceID: ""
    }
};

var protobuf = require("node-protobuf");
var protobufjs = require("protobufjs");
var fs = require("fs");
var encoder = new protobuf.Protobuf(fs.readFileSync("../../game-server/config/clientProtos.desc"));
var encoderIO = protobufjs.loadJson(require("../../game-server/config/clientProtos.json"));
var route = "connector_entryHandler_enter";

function testFun() {

    for (var i=0;i<1000;i++) {
//        var Builder = encoderIO.build(route);
//        new Builder(request).encodeNB();
        encoder.Serialize(request, route);
//        JSON.stringify(request);
    }
}

for (var i=0;i<100;i++) testFun();

var start = new Date();

for (var i=0;i<100;i++) testFun();

var end = new Date();
console.log(end - start);

