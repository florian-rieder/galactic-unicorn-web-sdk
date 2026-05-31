/**
 * Monaco editor bootstrap for the Lua SDK workspace.
 *
 * This file only creates the editor and wires up language helpers from `./monaco/`.
 * Each helper registers a Monaco "provider" (callback Monaco calls when the user
 * types, hovers, etc.). See the module files for what each provider does.
 */
import * as monaco from "./monaco/custom-monaco.js";
import { registerLuaColorProvider } from "./monaco/lua-color-provider.js";
import { installLuaDiagnostics } from "./monaco/lua-diagnostics.js";
import { installSdkNameHighlights } from "./monaco/lua-sdk-highlights.js";
import {
  registerLuaCompletionProvider,
  registerLuaHoverProvider,
} from "./monaco/lua-sdk-providers.js";

const editorOptions = {
  language: "lua",
  theme: "vs-dark", // Theme (vs, vs-dark, hc-black)
  tabSize: 2, // Lua style: 2-space indentation
  insertSpaces: true, // Use spaces when Tab is pressed
  detectIndentation: false, // Keep explicit tabSize instead of auto-detecting
  minimap: { enabled: true }, // Show minimap (code overview)
  scrollBeyondLastLine: false, // Disable scrolling beyond the last line
  automaticLayout: true, // Enable resizing of the editor
};

let editor;

export const MonacoEditor = Object.freeze({
  /**
   * Creates the Monaco editor and registers Lua SDK helpers. Call once at startup.
   *
   * @param {String} defaultTextContent text content to load as the default buffer upon load
   */
  async init(defaultTextContent = "") {
    let sdkApi = null;

    // Providers can be registered before the editor exists; Monaco applies them to
    // all future Lua models. Color + completion are registered early so they work
    // even if lua-api.json fails to load.
    registerLuaColorProvider();
    // getApi is a closure: sdkApi starts null, then points at JSON after fetch below.
    // Completion merges in-file symbols immediately and SDK items once api is loaded.
    registerLuaCompletionProvider(() => sdkApi);

    // Generated from lua.js by scripts/generate_lua_api.py, same data as the docs page.
    const apiJsonUrl = `${import.meta.env.BASE_URL}docs/lua-api.json`;
    try {
      const res = await fetch(apiJsonUrl);
      if (!res.ok) {
        throw new Error(`Failed to load generated API data (${res.status})`);
      }
      sdkApi = await res.json();
      registerLuaHoverProvider(sdkApi);
    } catch (err) {
      console.warn("Monaco Lua API docs unavailable:", err);
    }

    const container = document.getElementById("monaco-container");

    // Create the editor
    editorOptions.value = defaultTextContent;
    editor = monaco.editor.create(container, editorOptions);
    // Syntax error squiggles: Fengari compile-only.
    installLuaDiagnostics(editor, monaco);
    if (sdkApi) {
      installSdkNameHighlights(editor, sdkApi);
    }

    // Enable the play button only after the editor has successfully loaded
    document.getElementById("run-button").disabled = false;
  },

  /**
   * Set a given string as the open buffer in the monaco editor
   * @param {String} text
   */
  setText(text, readOnly = false) {
    if (!editor) return;

    editor.setValue(text);
    // see https://github.com/microsoft/monaco-editor/issues/54
    editor.updateOptions({ readOnly: readOnly });
  },

  /**
   * Get the currently open buffer in the monaco editor
   * @returns {String} the open buffer in the monaco editor
   */
  getText() {
    if (!editor) return "";

    return editor.getValue();
  },
});
