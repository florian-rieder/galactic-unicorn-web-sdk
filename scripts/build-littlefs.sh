#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src/js/vendor/littlefs
curl -fsSL -o src/js/vendor/littlefs/lfs.js https://github.com/hurzhurz/littlefs-js/releases/download/v2.5.1.0-name_max/lfs.js
curl -fsSL -o src/js/vendor/littlefs/lfs_js.js https://github.com/hurzhurz/littlefs-js/releases/download/v2.5.1.0-name_max/lfs_js.js
