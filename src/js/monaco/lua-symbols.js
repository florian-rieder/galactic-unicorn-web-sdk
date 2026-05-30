/**
 * In-file autocompletion symbols (locals, functions, loop vars, …).
 *
 * Not a real language server. We regex-scan the buffer so suggestions still work
 * when the file has syntax errors (Fengari would refuse to parse). Tradeoff:
 * false positives inside strings/comments; no scope awareness.
 */
/** Lua keywords, never offered as completion symbols. */
const LUA_KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "goto",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

const IDENT = /[a-zA-Z_][\w]*/;

/**
 * @param {string} name
 * @returns {boolean}
 */
function isIdent(name) {
  return Boolean(name) && IDENT.test(name) && !LUA_KEYWORDS.has(name);
}

/**
 * Scan Lua source for names worth completing (works even when the file has syntax errors).
 *
 * @param {string} source
 * @returns {Map<string, { kind: "variable" | "function", detail: string }>}
 */
export function collectDocumentSymbols(source) {
  const byName = new Map();

  /**
   * @param {string} name
   * @param {"variable" | "function"} kind
   * @param {string} detail
   */
  function add(name, kind, detail) {
    if (!isIdent(name)) return;
    if (!byName.has(name)) {
      byName.set(name, { kind, detail });
    }
  }

  let match;

  // Order matters a little: `local function foo` must be caught before plain `local`.
  const localFnPattern = /\blocal\s+function\s+([a-zA-Z_][\w]*)/g;
  while ((match = localFnPattern.exec(source)) !== null) {
    add(match[1], "function", "local function");
  }

  const localPattern = /\blocal\s+([a-zA-Z_][\w]*(?:\s*,\s*[a-zA-Z_][\w]*)*)/g;
  while ((match = localPattern.exec(source)) !== null) {
    const chunk = match[1];
    if (chunk.startsWith("function")) continue;
    for (const part of chunk.split(",")) {
      const name = part.trim();
      add(name, "variable", "local");
    }
  }

  const fnPattern = /\bfunction\s+([a-zA-Z_][\w]*)\s*\(/g;
  while ((match = fnPattern.exec(source)) !== null) {
    add(match[1], "function", "function");
  }

  const forNumericPattern = /\bfor\s+([a-zA-Z_][\w]*)\s*=/g;
  while ((match = forNumericPattern.exec(source)) !== null) {
    add(match[1], "variable", "for loop");
  }

  const forInPattern =
    /\bfor\s+([a-zA-Z_][\w]*)\s*,\s*([a-zA-Z_][\w]*)\s+in\b/g;
  while ((match = forInPattern.exec(source)) !== null) {
    add(match[1], "variable", "for loop");
    add(match[2], "variable", "for loop");
  }

  const paramPattern = /\bfunction\s+(?:[a-zA-Z_][\w.]*\s*)?\(([^)]*)\)/g;
  while ((match = paramPattern.exec(source)) !== null) {
    for (const raw of match[1].split(",")) {
      let name = raw.trim();
      if (!name) continue;
      name = name.replace(/^\.\.\./, "");
      name = name.split("=")[0].trim();
      add(name, "variable", "parameter");
    }
  }

  return byName;
}

/**
 * @param {import("monaco-editor")} monaco
 * @param {Map<string, { kind: string, detail: string }>} symbols
 * @param {import("monaco-editor").IRange} replaceRange
 * @param {string} [prefix] Lowercase filter prefix from the word at the cursor.
 */
export function documentSymbolsToCompletionItems(
  monaco,
  symbols,
  replaceRange,
  prefix = "",
) {
  const items = [];
  for (const [name, info] of symbols) {
    if (prefix && !name.toLowerCase().startsWith(prefix)) continue;
    items.push({
      label: name,
      kind:
        info.kind === "function"
          ? monaco.languages.CompletionItemKind.Function
          : monaco.languages.CompletionItemKind.Variable,
      insertText: name,
      detail: info.detail,
      // Sort before SDK items (see lua-sdk-providers.js sortText `1_…`).
      sortText: `0_${name}`,
      range: replaceRange,
    });
  }
  return items;
}

/**
 * Replace range for the identifier fragment being completed.
 *
 * Monaco needs an explicit range on each completion item. Without it, accepting
 * a suggestion may not replace the word you were typing.
 *
 * @param {import("monaco-editor").editor.ITextModel} model
 * @param {import("monaco-editor").Position} position
 */
export function getCompletionReplaceRange(model, position) {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}
