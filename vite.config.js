import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import monacoEditorPluginPkg from "vite-plugin-monaco-editor";

const rootDir = dirname(fileURLToPath(import.meta.url));

// vite-plugin-monaco-editor is CJS; under ESM the default import may be the
// module namespace rather than the function itself.
const monacoEditorPlugin =
  monacoEditorPluginPkg.default ?? monacoEditorPluginPkg;

const LUA_API_WATCH_DEBOUNCE_MS = 200;

const LUA_API_WATCH_FILES = [
  resolve(rootDir, "src/js/lua/lua.js"),
  resolve(rootDir, "docs/API.intro.md"),
  resolve(rootDir, "docs/templates/api.template.html"),
];

/**
 * Regenerates `public/docs/*` from `scripts/generate_lua_api.py` during dev.
 * Does not fail the dev server if Python is missing or the script errors.
 */
function regenLuaApiPlugin() {
  const watchedSet = new Set(LUA_API_WATCH_FILES.map((p) => resolve(p)));
  let debounceTimer = null;

  /**
   * @param {import('vite').ViteDevServer} server
   */
  function runGenerate(server) {
    const proc = spawn("python", ["scripts/generate_lua_api.py"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    let spawnErrored = false;
    proc.on("error", (err) => {
      spawnErrored = true;
      if (err.code === "ENOENT") {
        console.warn(
          "[lua-api] `python` not found on PATH; skipping generate_lua_api.py"
        );
      } else {
        console.warn("[lua-api]", err.message);
      }
    });

    proc.on("close", (code) => {
      if (spawnErrored) return;
      if (code !== 0 && code !== null) {
        console.warn(
          `[lua-api] generate_lua_api.py exited with code ${code}`,
          stderr.trim() ? `\n${stderr.trim()}` : ""
        );
        return;
      }
      if (code === 0 && server.ws) {
        server.ws.send({ type: "full-reload" });
      }
    });
  }

  /**
   * @param {import('vite').ViteDevServer} server
   */
  function scheduleGenerate(server) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(
      () => runGenerate(server),
      LUA_API_WATCH_DEBOUNCE_MS
    );
  }

  return {
    name: "regen-lua-api",
    configureServer(server) {
      runGenerate(server);

      for (const file of LUA_API_WATCH_FILES) {
        server.watcher.add(file);
      }

      server.watcher.on("change", (file) => {
        if (!watchedSet.has(resolve(file))) return;
        scheduleGenerate(server);
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/<repo>/
  base: "/galactic-unicorn-web-sdk/",
  plugins: [
    monacoEditorPlugin({
      // Only ship the base editor worker (discard HTML/CSS/JS/TS workers)
      languageWorkers: ["editorWorkerService"],
      // Plugin default joins `outDir` + `base` + publicPath, but `base` is only a
      // URL prefix on GitHub Pages so workers must live at dist/monacoeditorwork/.
      customDistPath: (root, outDir) => join(root, outDir, "monacoeditorwork"),
    }),
    regenLuaApiPlugin(),
  ],
});
