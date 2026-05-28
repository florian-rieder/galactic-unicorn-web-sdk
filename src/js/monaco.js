import * as monaco from "monaco-editor";
import "monaco-editor/min/vs/editor/editor.main.css";
import { clampByte, hslToRgb, rgbToHsl } from "./color.js";

const editorOptions = {
  language: "lua", // Language (supports html, css, python, etc.)
  theme: "vs-dark", // Theme (vs, vs-dark, hc-black)
  tabSize: 2, // Lua style: 2-space indentation
  insertSpaces: true, // Use spaces when Tab is pressed
  detectIndentation: false, // Keep explicit tabSize instead of auto-detecting
  minimap: { enabled: true }, // Show minimap (code overview)
  scrollBeyondLastLine: false, // Disable scrolling beyond the last line
  automaticLayout: true, // Enable resizing of the editor
};

const UPDATE_TIMEOUT_DURATION_MS = 100

let editor;

function registerLuaColorProvider() {
  monaco.languages.registerColorProvider("lua", {
    provideDocumentColors(model) {
      const text = model.getValue();
      const infos = [];

      const rgbPattern =
        /\brgb\s*\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/g;
      let rgbMatch;
      while ((rgbMatch = rgbPattern.exec(text)) !== null) {
        const r = clampByte(Number(rgbMatch[1]));
        const g = clampByte(Number(rgbMatch[2]));
        const b = clampByte(Number(rgbMatch[3]));
        const start = model.getPositionAt(rgbMatch.index);
        const end = model.getPositionAt(rgbMatch.index + rgbMatch[0].length);
        infos.push({
          color: { red: r / 255, green: g / 255, blue: b / 255, alpha: 1 },
          range: new monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column,
          ),
        });
      }

      const hslPattern =
        /\bhsl\s*\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/g;
      let hslMatch;
      while ((hslMatch = hslPattern.exec(text)) !== null) {
        const h = Number(hslMatch[1]);
        const s = Number(hslMatch[2]);
        const l = Number(hslMatch[3]);
        const rgb = hslToRgb(h, s, l);
        const start = model.getPositionAt(hslMatch.index);
        const end = model.getPositionAt(hslMatch.index + hslMatch[0].length);
        infos.push({
          color: {
            red: rgb.r / 255,
            green: rgb.g / 255,
            blue: rgb.b / 255,
            alpha: 1,
          },
          range: new monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column,
          ),
        });
      }

      return infos;
    },

    provideColorPresentations(model, colorInfo) {
      const source = model.getValueInRange(colorInfo.range);
      const r = clampByte(colorInfo.color.red * 255);
      const g = clampByte(colorInfo.color.green * 255);
      const b = clampByte(colorInfo.color.blue * 255);
      const hsl = rgbToHsl(r, g, b);

      const rgbLabel = `rgb(${r}, ${g}, ${b})`;
      const hslLabel = `hsl(${hsl.h}, ${hsl.s}, ${hsl.l})`;
      const rgbPresentation = {
        label: rgbLabel,
        textEdit: { range: colorInfo.range, text: rgbLabel },
      };
      const hslPresentation = {
        label: hslLabel,
        textEdit: { range: colorInfo.range, text: hslLabel },
      };

      if (/^\s*hsl\s*\(/.test(source)) {
        return [hslPresentation, rgbPresentation];
      }
      return [rgbPresentation, hslPresentation];
    },
  });
}

function buildSignature(item) {
  const params = (item.params || []).map((param) => param.name).join(", ");
  return `${item.lua_name}(${params})`;
}

function buildCallbackInsertText(cb) {
  const params = (cb.params || []).map((param) => param.name).join(", ");
  // Monaco snippets use `$0` as the final cursor position after insertion.
  // Here that means: after accepting `update`, the caret lands inside the body.
  return `function ${cb.lua_name}(${params})\n  $0\nend`;
}

function snippetPlaceholder(index, text) {
  return "${" + index + ":" + text + "}";
}

function buildSdkFunctionInsertText(item) {
  const params = item.params || [];
  const paramNames = params.map((p) => p.name);

  // For 0-arg calls like `clear()`, place the cursor inside parentheses so
  // the completion still behaves like a snippet and feels consistent.
  if (paramNames.length === 0) {
    return `${item.lua_name}($0)`;
  }

  // For arg calls, prefill with parameter names and let Tab jump argument-by-argument.
  // Note: Monaco treats `${0:...}` as the final placeholder, so use 1-based indices.
  let tabIndex = 1;
  const args = params.map((param) => {
    const name = param.name;
    const type = param.type;

    // String parameters are wrapped in quotes so users can start typing immediately.
    if (type === "string") {
      const placeholder = snippetPlaceholder(tabIndex, "");
      tabIndex += 1;
      return `"${placeholder}"`;
    }

    const placeholder = snippetPlaceholder(tabIndex, name);
    tabIndex += 1;
    return placeholder;
  });
  return `${item.lua_name}(${args.join(", ")})`;
}

function buildHoverMarkdown(item) {
  // Monaco hover/completion docs accept Markdown, so we generate one shared
  // representation from the structured API JSON and reuse it everywhere.
  const lines = [];
  lines.push("```lua");
  lines.push(buildSignature(item));
  lines.push("```");
  if (item.summary) {
    lines.push(item.summary);
  }
  if (Array.isArray(item.details) && item.details.length > 0) {
    lines.push(...item.details);
  }
  if (Array.isArray(item.params) && item.params.length > 0) {
    lines.push("");
    lines.push("**Parameters**");
    for (const param of item.params) {
      lines.push(`- \`${param.name}\` (${param.type}): ${param.description}`);
    }
  }
  if (item.returns) {
    lines.push("");
    lines.push(`**Returns:** \`${item.returns}\``);
  }
  if (item.example) {
    lines.push("");
    lines.push("**Example**");
    lines.push("```lua");
    lines.push(item.example);
    lines.push("```");
  }
  return lines.join("\n");
}

function registerLuaApiProviders(api) {
  // Completion and hover are registered from generated API metadata.
  // This keeps Monaco behavior in sync with the docs page and `lua.js`.
  monaco.languages.registerCompletionItemProvider("lua", {
    provideCompletionItems: function () {
      // Build fresh completion items on every request. Monaco mutates some
      // item fields internally (like ranges), so reusing old objects can
      // produce invalid-completion warnings when the cursor moves.
      const functionSuggestions = (api.functions || []).map((item) => ({
        label: item.lua_name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: buildSdkFunctionInsertText(item),
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: "[SDK Function]",
        // Use a plain markdown string for maximum compatibility.
        documentation: buildHoverMarkdown(item),
      }));

      const callbackSuggestions = (api.callbacks || []).map((cb) => ({
        label: cb.lua_name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: buildCallbackInsertText(cb),
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: "[SDK Callback]",
        documentation: buildHoverMarkdown(cb),
      }));

      const constantSuggestions = (api.constants || []).map((item) => ({
        label: item.name,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: item.name,
        detail: `[SDK Constant] ${item.type}`,
        documentation: `${item.description}\n\nValue: \`${item.value_expression}\``,
      }));

      return {
        suggestions: [
          ...functionSuggestions,
          ...callbackSuggestions,
          ...constantSuggestions,
        ],
      };
    },
  });

  // Hover uses a simple name -> markdown map because it only needs to answer:
  // "the word under the cursor is X, what docs should Monaco show for X?"
  const hoverMap = new Map();
  for (const fn of api.functions || []) {
    hoverMap.set(fn.lua_name, buildHoverMarkdown(fn));
  }
  for (const cb of api.callbacks || []) {
    hoverMap.set(cb.lua_name, buildHoverMarkdown(cb));
  }
  for (const constant of api.constants || []) {
    hoverMap.set(
      constant.name,
      `${constant.description}\n\nType: \`${constant.type}\`\n\nValue: \`${constant.value_expression}\``,
    );
  }

  monaco.languages.registerHoverProvider("lua", {
    provideHover: function (model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const markdown = hoverMap.get(word.word);
      if (!markdown) return null;
      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        ),
        contents: [{ value: markdown }],
      };
    },
  });
}

function escapeRegExp(lit) {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function injectSdkHighlightStyle() {
  // Monaco decorations are styled through regular CSS classes.
  if (document.getElementById("sdk-api-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "sdk-api-highlight-style";
  style.textContent = `
.sdk-api-symbol {
  color: #ffd166 !important;
}
`;
  document.head.appendChild(style);
}

function installSdkNameHighlights(editor, api) {
  if (!api) return;
  injectSdkHighlightStyle();

  const model = editor.getModel();
  if (!model) return;

  const names = [
    ...(api.functions || []).map((f) => f.lua_name),
    ...(api.callbacks || []).map((c) => c.lua_name),
    ...(api.constants || []).map((c) => c.name),
  ];
  const uniqueNames = [...new Set(names)].filter(Boolean);
  if (uniqueNames.length === 0) return;

  const escaped = uniqueNames.map(escapeRegExp);
  const regex = new RegExp(`\\b(?:${escaped.join("|")})\\b`, "g");

  let decorationIds = [];
  let updateTimeoutId = null;

  function getScanRanges() {
    // For scalability, only scan what is currently visible in the editor
    // instead of re-tokenizing the whole document on every keystroke.
    if (typeof editor.getVisibleRanges === "function") {
      const visibleRanges = editor.getVisibleRanges() || [];
      if (visibleRanges.length > 0) return visibleRanges;
    }

    // Fallback: scan the whole file (should be rare).
    const lineCount = model.getLineCount();
    const lastLineMaxCol =
      typeof model.getLineMaxColumn === "function"
        ? model.getLineMaxColumn(lineCount)
        : model.getLineLength(lineCount) + 1;

    return [new monaco.Range(1, 1, lineCount, Math.max(1, lastLineMaxCol))];
  }

  function getRangeText(range) {
    if (typeof model.getValueInRange === "function") {
      return model.getValueInRange(range);
    }

    // Fallback if getValueInRange isn't available.
    const fullText = model.getValue();
    const startOffset = model.getOffsetAt({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });
    const endOffset = model.getOffsetAt({
      lineNumber: range.endLineNumber,
      column: range.endColumn,
    });
    return fullText.slice(startOffset, endOffset);
  }

  function computeDecorations() {
    // Decorations are Monaco's lightweight way to visually mark ranges in the
    // document without changing the underlying text or language tokenizer.
    const matches = [];
    const seen = new Set();

    const scanRanges = getScanRanges();
    const maxMatches = 5000; // Safety valve for huge files.

    for (const scanRange of scanRanges) {
      if (matches.length >= maxMatches) break;

      const rangeText = getRangeText(scanRange);
      if (!rangeText) continue;

      const rangeStartOffset = model.getOffsetAt({
        lineNumber: scanRange.startLineNumber,
        column: scanRange.startColumn,
      });

      regex.lastIndex = 0;
      let match = regex.exec(rangeText);
      while (match && matches.length < maxMatches) {
        const matchedText = match[0];
        const matchStartOffset = rangeStartOffset + match.index;
        const matchEndOffset = matchStartOffset + matchedText.length;

        const start = model.getPositionAt(matchStartOffset);
        const end = model.getPositionAt(matchEndOffset);

        const key = `${start.lineNumber}:${start.column}-${end.lineNumber}:${end.column}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            range: new monaco.Range(
              start.lineNumber,
              start.column,
              end.lineNumber,
              end.column,
            ),
            options: { inlineClassName: "sdk-api-symbol" },
          });
        }

        match = regex.exec(rangeText);
      }
    }

    decorationIds = editor.deltaDecorations(decorationIds, matches);
  }

  function scheduleUpdate() {
    // Debounce decoration updates so fast typing/scrolling does not trigger
    // a full visible-range scan on every single event.
    if (updateTimeoutId != null) clearTimeout(updateTimeoutId);
    updateTimeoutId = setTimeout(() => computeDecorations(), UPDATE_TIMEOUT_DURATION_MS);
  }

  // Initial render + updates on edits.
  computeDecorations();
  editor.onDidChangeModelContent(() => scheduleUpdate());
  editor.onDidScrollChange(() => scheduleUpdate());
}

/**
 * Creates the Monaco editor and registers Lua SDK helpers. Call once at startup.
 * 
 * @param {String} defaultTextContent text content to load as the default buffer upon load
 */
export async function initMonaco(defaultTextContent = "") {
  let sdkApi = null;
  let highlightsInstalled = false;
  registerLuaColorProvider();

  const apiJsonUrl = `${import.meta.env.BASE_URL}docs/lua-api.json`;
  try {
    const res = await fetch(apiJsonUrl);
    if (!res.ok) {
      throw new Error(`Failed to load generated API data (${res.status})`);
    }
    sdkApi = await res.json();
    registerLuaApiProviders(sdkApi);
  } catch (err) {
    console.warn("Monaco Lua API docs unavailable:", err);
  }

  const container = document.getElementById("monaco-container");

  // Create the editor
  editorOptions.value = defaultTextContent;
  editor = monaco.editor.create(container, editorOptions);
  if (sdkApi && !highlightsInstalled) {
    highlightsInstalled = true;
    installSdkNameHighlights(editor, sdkApi);
  }

  // Enable the play button only after the editor has successfully loaded
  document.getElementById("run-button").disabled = false;
}

/**
 * Set a given string as the open buffer in the monaco editor
 * @param {String} text 
 */
export function setEditorText(text, readOnly = false) {
  editor.setValue(text);
  // see https://github.com/microsoft/monaco-editor/issues/54
  editor.updateOptions({ readOnly: readOnly })
}

/**
 * Get the currently open buffer in the monaco editor
 * @returns {String} the open buffer in the monaco editor
 */
export function getEditorText() {
  return editor.getValue();
}