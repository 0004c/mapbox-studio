#!/usr/bin/env bash

cwd=$(pwd)
arch="x64"

# @TODO 0.10.30 must be added to https://github.com/mapbox/node-pre-gyp/blob/master/lib/util/abi_crosswalk.json
# and available in all our node-pre-gyp modules.
node_version="0.10.26"

if [ -z "$1" ]; then
    gitsha="master"
else
    gitsha=$1
fi

if [ -z "$2" ]; then
    platform=$(uname -s | sed "y/ABCDEFGHIJKLMNOPQRSTUVWXYZ/abcdefghijklmnopqrstuvwxyz/")
else
    platform=$2
fi

if [ "$platform" == "win32" ]; then
    arch="ia32"
fi

set -e -u
set -o pipefail

if ! which git > /dev/null; then echo "git command not found"; exit 1; fi;
if ! which aws > /dev/null; then echo "aws command not found"; exit 1; fi;
if ! which npm > /dev/null; then echo "npm command not found"; exit 1; fi;
if ! which tar > /dev/null; then echo "npm command not found"; exit 1; fi;
if ! which curl > /dev/null; then echo "curl command not found"; exit 1; fi;
if ! which unzip > /dev/null; then echo "unzip command not found"; exit 1; fi;

build_dir="/tmp/mapbox-studio-$platform-$arch-$gitsha"
shell_url="https://github.com/atom/atom-shell/releases/download/v0.15.1/atom-shell-v0.15.1-$platform-$arch.zip"
shell_file="/tmp/atom-shell-v0.15.1-$platform-$arch.zip"

if [ "$platform" == "darwin" ]; then
    app_dir="/tmp/mapbox-studio-$platform-$arch-$gitsha/Atom.app/Contents/Resources/app"
else
    app_dir="/tmp/mapbox-studio-$platform-$arch-$gitsha/resources/app"
fi

echo "Building bundle in $build_dir"

if [ -d $build_dir ]; then
    echo "Build dir $build_dir already exists"
    exit 1
fi

curl -Lsfo $shell_file $shell_url
unzip $shell_file -d $build_dir
rm $shell_file

git clone https://github.com/mapbox/mapbox-studio.git $app_dir
cd $app_dir
git checkout $gitsha
rm -rf $app_dir/.git
npm install --production

# Go through pre-gyp modules and rebuild for target platform/arch.
modules="node_modules/mapnik
node_modules/mbtiles/node_modules/sqlite3
node_modules/mapnik-omnivore/node_modules/srs
node_modules/mapnik-omnivore/node_modules/gdal"
for module in $modules; do
    rm -r $app_dir/$module/lib/binding
    cd $app_dir/$module
    ./node_modules/.bin/node-pre-gyp install \
        --target_platform=$platform \
        --target=$node_version \
        --target_arch=$arch \
        --fallback-to-build=false
    echo $module
done

# Zip things up
cd /tmp
zip -qr $build_dir.zip $(basename $build_dir)
rm -rf $build_dir

# Make the zip self extracting
if [ $platform == "win32" ]; then
    cat $cwd/$(dirname $0)/../vendor/unzipsfx-552_win32/unzipsfx.exe $build_dir.zip > $build_dir.exe
    zip -A $build_dir.exe
    aws s3 cp --acl=public-read $build_dir.exe s3://mapbox/mapbox-studio/
    echo "Build at https://mapbox.s3.amazonaws.com/mapbox-studio/$(basename $build_dir.exe)"
else
    aws s3 cp --acl=public-read $build_dir.zip s3://mapbox/mapbox-studio/
    echo "Build at https://mapbox.s3.amazonaws.com/mapbox-studio/$(basename $build_dir.zip)"
fi

rm -f $build_dir.zip $build_dir.exe

cd $cwd

