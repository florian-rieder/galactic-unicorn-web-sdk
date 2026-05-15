# Galactic Unicorn Coinflip Web SDK

Browser-based SDK for developing Lua scripts for the Galactic Unicorn handheld: it combines an emulator, an in-browser editor, and serial-style console output so you can iterate without reflashing hardware on every change.

## Why this exists

Developing directly on device is slow when every test requires another flash cycle. This SDK gives script authors and contributors a fast local loop: edit Lua, run immediately, inspect output, repeat.

## What is included

- Emulator for the project display/input model
- Monaco-based (VS Code) in-browser Lua editor
- Console output panel for script logging and runtime errors
- Lua runtime in the browser via Fengari
- Example Lua scripts in `src/lua/`

## Project status

This project is currently **experimental** and still evolving toward a stable public release.
The Lua API is still subject to breaking changes.

## Run locally

The app must be served over a local web server (opening `index.html` directly will cause browser restrictions/CORS issues, especially around Monaco/module loading).

### 1) Build `fengari.js`

```bash
bash build.sh
```

This script clones Fengari temporarily, builds a browser bundle, and writes it to `dist/fengari.js`.

### 2) Serve the project

Use any static local web server from the repository root.

Example options:

- VS Code Five Server extension
- Python: `python3 -m http.server 5500`
- [Simple Web Server](https://simplewebserver.org/)

Then open the served URL in your browser.

## API documentation

Lua host bindings documentation are generated from `src/js/lua.js` JSDoc + API registries.

Generate artifacts with:

```bash
pip install -r requirements.txt
python scripts/generate_lua_api.py
```

This writes:

 - `docs/generated/API.md`
 - `src/generated/lua-api.json` (used by Monaco completion/hover)
 - `docs/generated/api.html` (opened from the toolbar "API docs" button)

## Key project files

- `index.html` - main web app shell
- `src/js/main.js` - run/stop flow and frame loop
- `src/js/lua.js` - Lua state setup and host API bindings
- `src/js/input.js` - keyboard mapping and button events
- `src/js/display.js` - framebuffer and drawing helpers
- `src/lua/` - example/demo Lua scripts