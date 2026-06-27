#!/usr/bin/env bash
# Download LuaLS (if needed), materialize stdlib meta stubs, and regenerate
# src/js/monaco/data/lua-stdlib.json.
#
# See scripts/lua-stdlib/PROVENANCE.md for background.

set -euo pipefail

# Configuration

# LuaLS release: https://github.com/LuaLS/lua-language-server/releases
LUALS_VERSION="3.18.2"
# Must match Fengari and firmware runtime version.
LUA_VERSION="5.3"
# LuaLS meta folder locale and encoding (see meta/ under the LuaLS tarball).
LUA_LOCALE="en-us"
LUA_ENCODING="utf8"
# Override to skip auto-detect (e.g. darwin-arm64, darwin-x64, linux-x64, linux-arm64).
LUALS_PLATFORM=""
# Set to 1 to re-download the LuaLS tarball even if .tools/bin exists.
FORCE_LUALS_DOWNLOAD=0
# Set to 1 to re-run LuaLS --doc even if meta stubs already exist.
FORCE_META_MATERIALIZE=0

# Paths

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="$ROOT/scripts/lua-stdlib"
TOOLS="$WORKSPACE/.tools"
LUALS_BIN="$TOOLS/bin/lua-language-server"
LUALS_TARBALL="$TOOLS/luals.tar.gz"
OUTPUT_JSON="$ROOT/src/js/monaco/data/lua-stdlib.json"
GENERATOR="$ROOT/scripts/generate_lua_stdlib.py"

META_DIR_NAME="Lua ${LUA_VERSION} ${LUA_LOCALE} ${LUA_ENCODING}"
META_DIR="$TOOLS/meta/${META_DIR_NAME}"


detect_platform() {
  if [[ -n "$LUALS_PLATFORM" ]]; then
    echo "$LUALS_PLATFORM"
    return
  fi

  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}/${arch}" in
    Darwin/arm64)  echo "darwin-arm64" ;;
    Darwin/x86_64) echo "darwin-x64" ;;
    Linux/x86_64)  echo "linux-x64" ;;
    Linux/aarch64|Linux/arm64) echo "linux-arm64" ;;
    *)
      echo "Unsupported platform: ${os}/${arch}" >&2
      echo "Set LUALS_PLATFORM manually in scripts/build-stdlib.sh" >&2
      exit 1
      ;;
  esac
}

write_luarc() {
  cat >"$WORKSPACE/.luarc.json" <<EOF
{
  "\$schema": "https://raw.githubusercontent.com/LuaLS/vscode-lua/master/setting/schema.json",
  "runtime.version": "Lua ${LUA_VERSION}"
}
EOF
}

download_luals() {
  local platform url
  platform="$(detect_platform)"
  url="https://github.com/LuaLS/lua-language-server/releases/download/${LUALS_VERSION}/lua-language-server-${LUALS_VERSION}-${platform}.tar.gz"

  echo "Downloading LuaLS ${LUALS_VERSION} (${platform})..."
  mkdir -p "$TOOLS"
  curl -fsSL -o "$LUALS_TARBALL" "$url"
  tar -xzf "$LUALS_TARBALL" -C "$TOOLS"

  if [[ ! -x "$LUALS_BIN" ]]; then
    echo "LuaLS binary not found after extract: $LUALS_BIN" >&2
    exit 1
  fi

  echo "LuaLS $( "$LUALS_BIN" --version )"
}

ensure_luals() {
  if [[ "$FORCE_LUALS_DOWNLOAD" == "1" ]] || [[ ! -x "$LUALS_BIN" ]]; then
    download_luals
  fi
}

materialize_meta() {
  echo "Materializing meta stubs: ${META_DIR_NAME}"
  # Explicit paths only — never use \$(cd .. && pwd) (breaks when cd runs ls via chpwd).
  (cd "$TOOLS" && "$LUALS_BIN" --doc="$WORKSPACE" --doc_out_path="$WORKSPACE")

  if [[ ! -d "$META_DIR" ]]; then
    echo "Expected meta directory was not created: $META_DIR" >&2
    exit 1
  fi
}

ensure_meta() {
  if [[ "$FORCE_META_MATERIALIZE" == "1" ]] || [[ ! -d "$META_DIR" ]]; then
    materialize_meta
  fi
}

generate_json() {
  python3 "$GENERATOR" \
    --lua-version "$LUA_VERSION" \
    --meta-dir "$META_DIR" \
    --output "$OUTPUT_JSON"
}

main() {
  write_luarc
  ensure_luals
  ensure_meta
  generate_json
}

main "$@"
