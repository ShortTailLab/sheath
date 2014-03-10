#! /usr/bin/env bash
cd config
protoc serverProtos.proto -o serverProtos.desc
protoc clientProtos.proto -o clientProtos.desc
