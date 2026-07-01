# Galactic Unicorn Web SDK

Browser-based SDK for developing Lua scripts for the Galactic Unicorn handheld: it combines an emulator, an in-browser Lua code editor, and serial-style console output so you can iterate without reflashing hardware on every change. When you're ready, it can also flash your scripts (and the latest builtin data from [galactic-unicorn-data](https://github.com/florian-rieder/galactic-unicorn-data)) directly to the device over USB, in the browser.

[Try now](https://florian-rieder.github.io/galactic-unicorn-web-sdk/)

[Lua API Documentation](https://florian-rieder.github.io/galactic-unicorn-web-sdk/docs/api.html)

## Why this exists

Developing directly on device is slow when every test requires another flash cycle. This SDK gives script authors and contributors a fast local loop: edit Lua, run immediately, inspect output, repeat, without even needing access to the hardware.

## What is included

- Lua runtime in the browser via [Fengari](https://github.com/fengari-lua/fengari)
- Emulator for the project display/input model
- Monaco-based (VS Code) in-browser Lua editor
- Code completion and hover docs for the Galactic Unicorn API and Lua standard library
- Console output panel for script logging and runtime errors
- Virtual file system and file explorer
- Export project as a zip file
- Hardware filesystem flashing via Web Serial API (only available on Chromium-based browsers and Firefox 151+)
- Built-in cartridges and common Lua libraries

## Project status

This project is currently **experimental** and still evolving toward a stable public release.
The Lua API is still subject to breaking changes.

## Run locally

The app is built with [Vite 8](https://vitejs.dev/) and [Node.js 24](https://nodejs.org/en).

### 1) Clone

```bash
git clone --recurse-submodules https://github.com/florian-rieder/galactic-unicorn-web-sdk.git
cd galactic-unicorn-web-sdk
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

`builtin-data/` tracks the [built-in data](https://github.com/florian-rieder/galactic-unicorn-data) repo (same content as firmware’s filesystem data partition).

### 2) Install dependencies

```bash
npm install
```

**`esbuild`** is used both by `vite-plugin-monaco-editor` and by the `build:fengari` script that bundles Fengari for the browser (runs automatically before `dev` / `build`).

### 3) Development server

```bash
npm run dev
```

Open the URL Vite prints. The app is built with `base: '/galactic-unicorn-web-sdk/'` (GitHub Pages), so the dev entry should be:

[http://localhost:5173/galactic-unicorn-web-sdk/](http://localhost:5173/galactic-unicorn-web-sdk/)

Use that path (with trailing slash) so relative links like `./assets/...` resolve correctly. Hot reload is enabled.

### 4) Production build

Preview the production build using these commands:

```bash
npm run build
npm run preview
```

Static output goes to `dist/` for deployment. GitHub Pages serves the contents of `dist/` at  
`https://florian-rieder.github.io/galactic-unicorn-web-sdk/`

To test the production bundle locally, use `npm run preview` and open the URL Vite prints.

Production build and release is done automatically on pushes to `main` using [Github Actions](/.github/workflows/pages.yaml).

### Notes

- Opening `index.html` directly from disk is **not** supported; always use `npm run dev` or serve `dist/` after `npm run build`.
- UI assets live under `public/` (e.g. `public/assets/images/`).
- Inlined UI assets live under `/src/assets` (because they're inlined by Vite when bundling and therefore don't need to be served statically)

## Flashing to device

**Flash** writes the device’s LittleFS `/data` partition over USB. It does not flash the ESP firmware; the board must already run a compatible build.

Use a browser that supports Web Serial API: Chromium browsers (Chrome, Edge, Brave, etc.), or Firefox 151+.

On flash, the SDK merges the [built-in data](https://github.com/florian-rieder/galactic-unicorn-data/) with your workspace (files in the explorer), and writes the result. **Your files win** if the same path exists in both. You can edit just your game and flash without importing the full built-in tree first.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the [MIT License](/LICENSE)

## References

- [Lua 5.3 Reference Manual](https://www.lua.org/manual/5.3/manual.html)
- [Programming in Lua (1st edition)](https://www.lua.org/pil/contents.html)
- [Lua Metamethods Cheatsheet](https://gist.github.com/oatmealine/655c9e64599d0f0dd47687c1186de99f)
- [Fengari](https://github.com/fengari-lua/fengari)
- [UXN Sprites](https://compudanzas.net/uxn_tutorial_day_2.html#drawing%20sprites)
- [Microbit Sprites](https://microbit-micropython.readthedocs.io/en/latest/image.html)

## Dependencies

- [Fengari](https://github.com/fengari-lua/fengari) - Lua VM in the browser
- [Monaco Editor](https://github.com/microsoft/monaco-editor) - VS Code editor in the browser
- [esptool-js](https://github.com/espressif/esptool-js) - esptool in the browser
- [fflate](https://github.com/101arrowz/fflate) - zip compression/decompression
- [file-saver](https://github.com/eligrey/FileSaver.js) - file download utility
- [Sweet Alert 2](https://sweetalert2.github.io/) - simple and beautiful popups
