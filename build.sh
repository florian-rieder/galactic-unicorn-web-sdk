#!/bin/bash
# Clone fengari, build the browser bundle, clean up
git clone https://github.com/fengari-lua/fengari.git _fengari_build
cd _fengari_build
npm install
npx esbuild src/fengari.js \
  --bundle \
  --format=iife \
  --global-name=fengari \
  --platform=browser \
  --define:process.env.FENGARICONF=undefined \
  --define:process.platform=\"browser\" \
  --define:process.env.NODE_DEBUG=undefined \
  --external:os \
  --external:fs \
  --external:path \
  --external:child_process \
  --external:readline-sync \
  --external:tmp \
  --outfile=../dist/fengari.js
cd ..
rm -rf _fengari_build