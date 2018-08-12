#!/bin/bash

# must be run in basedirectory of quicker
# node directory must be in the parentdir 
cd ../node
./configure
make 
make -C out BUILDTYPE=Debug
cd ../quicker
tsc -p ./
clear
clear
# $1: host
# $2: port
# $3: resource
NODE_DEBUG=qtls ./../node/out/Release/node ./out/mainclient.js $1 $2 $3
