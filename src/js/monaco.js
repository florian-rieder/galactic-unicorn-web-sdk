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
    updateTimeoutId = setTimeout(() => computeDecorations(), 100);
  }

  // Initial render + updates on edits.
  computeDecorations();
  editor.onDidChangeModelContent(() => scheduleUpdate());
  editor.onDidScrollChange(() => scheduleUpdate());
}

// Tell the loader where to find Monaco's modules
require.config({
  paths: {
    vs: "https://unpkg.com/monaco-editor@0.55.1/min/vs", // CDN path for "vs" module
  },
});

// Load the main editor module and initialize
require(["vs/editor/editor.main"], function () {
  let sdkApi = null;
  let highlightsInstalled = false;

  // Monaco loads before our generated API metadata is available, so fetch it
  // asynchronously and register SDK-specific DX (hover/completion/highlights)
  // once the JSON is ready.
  fetch("src/generated/lua-api.json")
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load generated API data (${res.status})`);
      }
      return res.json();
    })
    .then((api) => {
      sdkApi = api;
      registerLuaApiProviders(api);
      // The editor may already exist at this point (depending on load order),
      // so install highlights here too instead of assuming editor creation
      // always happens after the API fetch finishes.
      if (window.editor && !highlightsInstalled) {
        highlightsInstalled = true;
        installSdkNameHighlights(window.editor, sdkApi);
      }
    })
    .catch((err) => {
      console.warn("Monaco Lua API docs unavailable:", err);
    });

  const container = document.getElementById("monaco-container");

  function createEditor(defaultCode = "") {
    editorOptions.value = defaultCode;
    window.editor = monaco.editor.create(container, editorOptions);
    if (sdkApi && !highlightsInstalled) {
      highlightsInstalled = true;
      installSdkNameHighlights(window.editor, sdkApi);
    }
    document.getElementById("run-button").disabled = false;
  }

  const savedCode = localStorage.getItem("lua_code");
  if (savedCode) {
    createEditor(savedCode);
  } else {
    // Get default script from src/lua/
    fetch("src/lua/pong.lua")
      .then((res) => res.text())
      .then((defaultScript) => {
        createEditor(defaultScript);
      });
  }
});

function save() {
  // get the value of the data
  var value = window.editor.getValue();

  if (value === "") {
    localStorage.removeItem("lua_code");
    return;
  }

  localStorage.setItem("lua_code", value);
}

window.addEventListener("keydown", (event) => {
  if (
    (event.key === "s" && event.ctrlKey) ||
    (event.key === "s" && event.metaKey)
  ) {
    event.preventDefault();
    save();
  }
});
