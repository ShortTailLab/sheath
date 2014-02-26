#! /usr/bin/env bash
cd config
proto2js serverProtos.proto > serverProtos.json
protoc serverProtos.proto -o serverProtos.desc

proto2js clientProtos.proto > clientProtos.json
protoc clientProtos.proto -o clientProtos.desc
