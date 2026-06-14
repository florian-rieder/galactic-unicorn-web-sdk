#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/.."
cd builtin-data
make build
mkdir -p ../public/data
mv dist/data.zip ../public/data/builtin-data.zip
