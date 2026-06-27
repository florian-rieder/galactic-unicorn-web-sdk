# Lua stdlib IntelliSense data (`lua-stdlib.json`)

## What this is

`src/js/monaco/data/lua-stdlib.json` is generated from the **Lua standard library
definition files** that ship with [Lua Language Server](https://github.com/LuaLS/lua-language-server)
(LuaLS). Those files are LuaCATS `@meta` stubs with descriptions taken from the
[Lua reference manual](https://www.lua.org/manual/5.3/).

The runtime sandbox only exposes a subset of that stdlib (see `src/js/lua-environment.js`);
the generator filters definitions to match.

## Configuration

All version pins live at the top of **`scripts/build-stdlib.sh`**

Bump `LUA_VERSION` there when the runtime changes.

## Reproduce

From the repository root:

```bash
bash scripts/build-stdlib.sh
```

This will:

1. Download and extract LuaLS (if `.tools/bin/lua-language-server` is missing)
2. Write `.luarc.json` from `LUA_VERSION`
3. Materialize `meta/Lua ${LUA_VERSION} ${LUA_LOCALE} ${LUA_ENCODING}/` via LuaLS (if missing)
4. Run `generate_lua_stdlib.py` → `src/js/monaco/data/lua-stdlib.json`

Set `FORCE_LUALS_DOWNLOAD=1` or `FORCE_META_MATERIALIZE=1` in the script to refresh cached toolchain/meta.
