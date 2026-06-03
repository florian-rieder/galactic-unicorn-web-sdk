# Galactic Unicorn Web SDK

Browser-based SDK for developing Lua scripts for the Galactic Unicorn handheld: it combines an emulator, an in-browser editor, and serial-style console output so you can iterate without reflashing hardware on every change.

[Try now](https://florian-rieder.github.io/galactic-unicorn-web-sdk/)

[Lua API Documentation](https://florian-rieder.github.io/galactic-unicorn-web-sdk/docs/api.html)

## Why this exists

Developing directly on device is slow when every test requires another flash cycle. This SDK gives script authors and contributors a fast local loop: edit Lua, run immediately, inspect output, repeat, without even needing access to the hardware.

## What is included
- Lua runtime in the browser via [Fengari](https://github.com/fengari-lua/fengari)
- Emulator for the project display/input model
- Monaco-based (VS Code) in-browser Lua editor
- Console output panel for script logging and runtime errors
- Virtual file system and file explorer
- Export project as a zip file
- Hardware filesystem flashing via Web Serial API (only available on Chromium-based browsers)
- Example Lua scripts in `src/lua/`

## Project status

This project is currently **experimental** and still evolving toward a stable public release.
The Lua API is still subject to breaking changes.

## Run locally

The app is built with [Vite](https://vitejs.dev/). Use Node.js 18+.

### 1) Install dependencies

```bash
npm install
```

**`esbuild`** is used both by `vite-plugin-monaco-editor` and by the `build:fengari` script that bundles Fengari for the browser (runs automatically before `dev` / `build`).

### 2) Development server

```bash
npm run dev
```

Open the URL Vite prints. The app is built with `base: '/galactic-unicorn-web-sdk/'` (GitHub Pages), so the dev entry is:

`http://localhost:5173/galactic-unicorn-web-sdk/`

Use that path (with trailing slash) so relative links like `./assets/...` resolve correctly. Hot reload is enabled.

### 3) Production build

```bash
npm run build
npm run preview
```

Static output goes to `dist/` for deployment. GitHub Pages serves this repo at  
`https://florian-rieder.github.io/galactic-unicorn-web-sdk/`, the Vite `base` option matches that path.

To test the production bundle locally, use `npm run preview` (serves `dist/` at the correct base).

### Notes

- Opening `index.html` directly from disk is **not** supported; always use `npm run dev` or serve `dist/` after `npm run build`.
- UI assets live under `public/` (e.g. `public/assets/images/`).
- Inlined UI assets live under `/src/assets` (because they're inlined by Vite when bundling and therefore don't need to be served statically)

## Flashing to device

The toolbar **Flash** button writes the **entire virtual filesystem** (everything listed in the file explorer) to the handheld's LittleFS data partition over USB. It does not flash firmware (the ESP application binary); your device must already be running compatible firmware.

### Requirements

- A **Chromium-based browser** (Chrome, Edge, Brave, etc.). Web Serial is not available in Firefox or Safari.
- A **Galactic Unicorn** connected by USB, with firmware that matches this SDK's flash layout.
- A **data filesystem archive** as a `.zip` file with the necessary system scripts (`/system/boot_menu.lua`, `/system/manifest.lson`).

### First-time setup (import from zip)

1. Open the SDK ([hosted app](https://florian-rieder.github.io/galactic-unicorn-web-sdk/) or [local dev](#run-locally)).
2. In the file explorer, use **Upload** (↑) and select the zip file.
3. Wait for the import to finish. The file tree should show the expected paths (e.g. `/system/`, `/lib/`, games, and so on).

### Flash

1. Click **Flash** in the toolbar.
2. Choose the serial port when the browser prompts you.
3. Wait for the progress UI to finish. Output also appears in the console panel.

Every file currently stored in the workspace gets assembled into a LittleFS image and written to the data partition. Paths in the explorer should match what the device expects (e.g. `/system/boot_menu.lua` for the menu). If you only have a single game file and no system tree, the device may not boot into a working menu until you import a complete data zip.

### Editing and re-flashing

- Use **Run** to test Lua in the browser without touching the device.
- Change files in the editor, save, then **Flash** again to push the updated workspace to the device.
- **Export** (⤴) downloads the workspace as `project.zip` for backup or sharing; you can re-import that zip later on another machine.

## API documentation

Lua host bindings documentation are generated from `src/js/lua.js` JSDoc + API registries.

During `npm run dev`, Vite watches `src/js/lua.js`, `docs/API.intro.md`, and `docs/templates/api.template.html`; each save reruns the generator and triggers a full reload when it succeeds. If `python` is missing from PATH or the script fails, the dev server keeps running and a warning is printed.

Generate or refresh artifacts manually with:

```bash
pip install -r requirements.txt
python scripts/generate_lua_api.py
```

This writes (all under the gitignored `public/docs/` so Vite serves them):

- `public/docs/API.md`
- `public/docs/api.html` (opened from the toolbar "API docs" button)
- `public/docs/lua-api.json` (consumed by Monaco completions/hover)

Without manual generation or a successful dev-time run, Monaco completions stay empty and the toolbar API docs link 404s until `public/docs/` exists. For production, this generation step is done in CI.

## References

- [Lua 5.3 Reference Manual](https://www.lua.org/manual/5.3/manual.html)
- [Programming in Lua](https://www.lua.org/pil/contents.html)
- [Lua Metamethods Cheatsheet](https://gist.github.com/oatmealine/655c9e64599d0f0dd47687c1186de99f)
- [Fengari](https://github.com/fengari-lua/fengari)
- [UXN Sprites](https://compudanzas.net/uxn_tutorial_day_2.html#drawing%20sprites)
- [Microbit Sprites](https://microbit-micropython.readthedocs.io/en/latest/image.html)
