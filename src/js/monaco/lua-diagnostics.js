/**
 * Live syntax error underlines for Lua buffers.
 *
 * Monaco has no built-in Lua linter. We reuse Fengari's parser via `luaL_loadbuffer`
 * Errors become red squiggles through setModelMarkers.
 *
 * Fengari only reports line numbers, not columns, so we guess the underline from
 * the `near 'token'` text in the error message.
 */
import fengari from "../vendor/fengari.js";

const { lua, lauxlib, to_luastring } = fengari;

const MARKER_OWNER_SYNTAX = "lua-syntax";
const DIAGNOSTICS_DEBOUNCE_MS = 300;
// Fake chunk name shown in error strings, e.g. (editor):12: ...
const CHUNK_NAME = "=(editor)";

/** @type {import("fengari").lua_State | null} */
let lintState = null;

function getLintState() {
  // Separate Lua state from the game runtime in lua.js. Linting must not touch
  // the VM that runs user scripts when Play is pressed.
  if (lintState === null) {
    lintState = lauxlib.luaL_newstate();
  }
  return lintState;
}

/**
 * Parse Fengari load errors, e.g. `(editor):12: '=' expected near 'foo'`.
 *
 * @param {string} message
 * @returns {{ line: number, message: string }}
 */
function parseLuaLoadError(message) {
  const text = String(message);
  const match = text.match(/:(\d+):\s*(.+)$/);
  if (match) {
    return {
      line: Number(match[1]),
      message: match[2],
    };
  }
  return { line: 1, message: text };
}

/**
 * Lua load errors omit columns; infer a range from `near 'token'` when possible.
 *
 * @param {string} lineText
 * @param {string} errorMessage
 * @returns {{ startColumn: number, endColumn: number }}
 */
function inferErrorRangeOnLine(lineText, errorMessage) {
  const lineLen = lineText.length;

  const nearMatch = errorMessage.match(
    /\bnear\s+(?:<eof>|'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/i
  );
  if (nearMatch) {
    if (/near\s+<eof>/i.test(errorMessage)) {
      let end = lineLen;
      while (end > 0 && /\s/.test(lineText[end - 1])) end -= 1;
      const start = Math.max(1, end);
      return {
        startColumn: start,
        endColumn: Math.max(start + 1, lineLen + 1),
      };
    }

    const token = (nearMatch[1] ?? nearMatch[2] ?? "")
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"');
    if (token) {
      // Punctuation errors (e.g. `,,`) usually refer to the last match on the line.
      const idx =
        token.length <= 2 && lineText.split(token).length > 2
          ? lineText.lastIndexOf(token)
          : lineText.indexOf(token);
      if (idx >= 0) {
        return {
          startColumn: idx + 1,
          endColumn: idx + token.length + 1,
        };
      }
    }
  }

  // Fallback: underline non-leading whitespace on the line.
  const leading = lineText.match(/^\s*/)?.[0].length ?? 0;
  const startColumn = leading + 1;
  const endColumn = Math.max(startColumn + 1, lineLen + 1);
  return { startColumn, endColumn };
}

/**
 * Compile Lua source without running it (same parser as the game runtime).
 *
 * @param {string} source
 * @returns {{ line: number, message: string } | null}
 */
function validateLuaSyntax(source) {
  const L = getLintState();
  const topBefore = lua.lua_gettop(L);

  const status = lauxlib.luaL_loadbuffer(
    L,
    to_luastring(source),
    source.length,
    to_luastring(CHUNK_NAME)
  );

  if (status === lua.LUA_OK) {
    // Pop the compiled chunk left on the stack; we never execute it.
    lua.lua_settop(L, topBefore);
    return null;
  }

  const message = lua.lua_tojsstring(L, -1);
  lua.lua_settop(L, topBefore);
  return parseLuaLoadError(message);
}

/**
 * Debounced Lua syntax diagnostics via Fengari (compile only).
 *
 * @param {import("monaco-editor").editor.IStandaloneCodeEditor} editor
 * @param {typeof import("monaco-editor")} monaco
 */
export function installLuaDiagnostics(editor, monaco) {
  const model = editor.getModel();
  if (!model) return;

  let timeoutId = null;

  function validate() {
    // Gate Lua diagnostics to only work on lua language
    if (model.getLanguageId() !== "lua") {
      monaco.editor.setModelMarkers(model, MARKER_OWNER_SYNTAX, []);
      return;
    }

    const text = model.getValue();

    if (!text.trim()) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER_SYNTAX, []);
      return;
    }

    const error = validateLuaSyntax(text);
    if (!error) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER_SYNTAX, []);
      return;
    }
    // Lua stops at the first syntax error. We only show one squiggle at a time.

    const line = error.line || 1;
    const lineText = model.getLineContent(line);
    const { startColumn, endColumn } = inferErrorRangeOnLine(
      lineText,
      error.message
    );

    // MARKER_OWNER_SYNTAX groups our diagnostics so we can replace/clear them
    // without clobbering markers from other features.
    monaco.editor.setModelMarkers(model, MARKER_OWNER_SYNTAX, [
      {
        startLineNumber: line,
        startColumn,
        endLineNumber: line,
        endColumn,
        message: error.message,
        severity: monaco.MarkerSeverity.Error,
      },
    ]);
  }

  function scheduleValidate() {
    // Re-parse on every edit would lag while typing; debounce like the SDK highlighter.
    if (timeoutId != null) clearTimeout(timeoutId);
    timeoutId = setTimeout(validate, DIAGNOSTICS_DEBOUNCE_MS);
  }

  validate();
  editor.onDidChangeModelContent(scheduleValidate);
}
