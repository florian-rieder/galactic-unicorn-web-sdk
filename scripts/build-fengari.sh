set -euo pipefail
cd "$(dirname "$0")/.."
esbuild node_modules/fengari/src/fengari.js --bundle --format=esm --platform=browser --define:process.env.FENGARICONF=undefined --define:process.env.NODE_DEBUG=undefined --define:process.platform='browser' --external:os --external:fs --external:path --external:child_process --external:readline-sync --external:tmp --outfile=src/js/vendor/fengari.js
