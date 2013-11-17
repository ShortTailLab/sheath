#! /usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR

rm -rf tmp
rm -rf shared
find shared.es6 -name "*.js" | xargs traceur --experimental --out tmp
mv tmp/shared.es6 shared
rm -rf tmp


cd game-server
rm -rf tmp
rm -rf app
find app.es6 -name "*.js" | xargs traceur --experimental --out tmp
mv tmp/app.es6 app
rm -rf tmp

