/**
 * Lua standard library autocompletion and hover tooltips.
 *
 * Data source: `data/lua-stdlib.json` (generated from LuaLS Lua 5.3 meta stubs).
 * Registers a second completion/hover provider; Monaco merges results with the SDK
 * and in-file symbol providers. Stdlib items use `sortText` prefix `2_` so they
 * rank below document symbols (`0_`) and SDK symbols (`1_`).
 */
import * as monaco from "./custom-monaco.js";
import { buildHoverMarkdown } from "./lua-sdk-providers.js";
import { getCompletionReplaceRange } from "./lua-symbols.js";

/** @type {import("./data/lua-stdlib.json")} */
import stdlibData from "./data/lua-stdlib.json";

/** `detail` string on completion items for top-level stdlib globals (e.g. `pairs`). */
const GLOBAL_STDLIB_DETAIL = "[Lua standard library]";

/** `detail` string on completion items for stdlib package tables (e.g. `math`). */
const PACKAGE_STDLIB_DETAIL = "[Lua standard library] package";

/** Top-level stdlib completion items (globals + packages tables). */
const TOP_LEVEL_STDLIB_DETAILS = new Set([
  GLOBAL_STDLIB_DETAIL,
  PACKAGE_STDLIB_DETAIL,
]);

/**
 * Matches text before the cursor when completing a namespace member.
 * Group 1: namespace (`math`), group 2: partial member name (`flo` in `math.flo`).
 */
const MEMBER_PREFIX_REGEX = /([A-Za-z_]\w*)\.(\w*)$/;

/**
 * Build Monaco snippet insert text for a stdlib function call.
 *
 * Uses `fn.name` (e.g. `pairs`, `floor`). String-typed parameters are
 * wrapped in quotes so the user can type immediately.
 *
 * @param {object} fn Normalized stdlib function from `lua-stdlib.json`.
 * @returns {string} Monaco snippet text.
 */
function buildStdlibFunctionInsertText(fn) {
  const params = fn.params || [];
  if (params.length === 0) {
    return `${fn.name}($0)`;
  }

  let tabIndex = 1;
  const args = params.map((param) => {
    if (param.name === "...") {
      return "...";
    }
    const placeholder = "${" + tabIndex + ":" + param.name + "}";
    tabIndex += 1;
    if (param.type === "string" || param.type.startsWith("string")) {
      return `"${placeholder}"`;
    }
    return placeholder;
  });
  return `${fn.name}(${args.join(", ")})`;
}

/**
 * Fully qualified stdlib call name for hover signatures and lookup keys.
 *
 * @param {object} fn Normalized stdlib function from `lua-stdlib.json`.
 * @param {string | undefined} namespace Parent package when the symbol is a member.
 * @returns {string}
 */
function stdlibQualifiedCallName(fn, namespace) {
  return namespace ? `${namespace}.${fn.name}` : fn.name;
}

/**
 * Build hover Markdown for a stdlib function.
 *
 * @param {object} fn Normalized stdlib function from `lua-stdlib.json`.
 * @param {string | undefined} namespace Parent package when the symbol is a member.
 * @returns {string}
 */
function buildStdlibHoverMarkdown(fn, namespace) {
  return buildHoverMarkdown({
    ...fn,
    lua_name: stdlibQualifiedCallName(fn, namespace),
  });
}

/**
 * Build hover Markdown for a namespace constant (e.g. `math.pi`).
 *
 * Constants use a simpler shape than functions (`name`, `type`, `description`).
 *
 * @param {object} constant Normalized stdlib constant from `lua-stdlib.json`.
 * @returns {string} Markdown shown in Monaco hover/completion docs.
 */
function buildConstantHoverMarkdown(constant) {
  const lines = [];
  if (constant.description) {
    lines.push(constant.description);
  }
  lines.push("");
  lines.push(`**Type:** \`${constant.type}\``);
  return lines.join("\n");
}

/**
 * Build hover Markdown for a stdlib package table (e.g. `math`).
 *
 * @param {string} namespace Package name.
 * @param {object} group Namespace payload from `lua-stdlib.json`.
 * @returns {string} Markdown shown in Monaco hover/completion docs.
 */
function buildNamespaceHoverMarkdown(namespace, group) {
  const fnCount = (group.functions || []).length;
  const constCount = (group.constants || []).length;
  const parts = [];
  if (fnCount > 0) {
    parts.push(`${fnCount} function${fnCount === 1 ? "" : "s"}`);
  }
  if (constCount > 0) {
    parts.push(`${constCount} constant${constCount === 1 ? "" : "s"}`);
  }
  const summary = parts.length > 0 ? parts.join(", ") : "members";
  return `Lua standard library \`${namespace}\` (${summary}).`;
}

/**
 * Build a lookup map from symbol keys to hover Markdown.
 *
 * Keys include bare globals (`pairs`), qualified names (`math.floor`), and
 * dotted member aliases derived from `namespace.name`.
 *
 * @param {object} stdlib Parsed `lua-stdlib.json` payload.
 * @returns {Map<string, string>} Symbol key to Markdown.
 */
function buildStdlibHoverMap(stdlib) {
  const hoverMap = new Map();

  for (const item of stdlib.globals || []) {
    hoverMap.set(item.name, buildStdlibHoverMarkdown(item));
  }

  for (const [namespace, group] of Object.entries(stdlib.namespaces || {})) {
    hoverMap.set(namespace, buildNamespaceHoverMarkdown(namespace, group));

    for (const fn of group.functions || []) {
      const qualified = stdlibQualifiedCallName(fn, namespace);
      hoverMap.set(qualified, buildStdlibHoverMarkdown(fn, namespace));
    }
    for (const constant of group.constants || []) {
      const key = `${namespace}.${constant.name}`;
      hoverMap.set(key, buildConstantHoverMarkdown(constant));
    }
  }

  return hoverMap;
}

/**
 * Build cached completion item templates for all stdlib symbols.
 *
 * Templates omit `range`; callers attach a fresh range per request because
 * Monaco mutates completion objects in place (same pattern as SDK provider).
 *
 * @param {object} stdlib Parsed `lua-stdlib.json` payload.
 * @returns {import("monaco-editor").languages.CompletionItem[]}
 */
function buildStdlibCompletionTemplates(stdlib) {
  const templates = [];

  for (const item of stdlib.globals || []) {
    templates.push({
      label: item.name,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: buildStdlibFunctionInsertText(item),
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: GLOBAL_STDLIB_DETAIL,
      sortText: `2_${item.name}`,
      documentation: buildStdlibHoverMarkdown(item),
    });
  }

  for (const [namespace, group] of Object.entries(stdlib.namespaces || {})) {
    templates.push({
      label: namespace,
      kind: monaco.languages.CompletionItemKind.Module,
      insertText: namespace,
      detail: PACKAGE_STDLIB_DETAIL,
      sortText: `2_${namespace}`,
      documentation: buildNamespaceHoverMarkdown(namespace, group),
    });

    for (const fn of group.functions || []) {
      templates.push({
        label: fn.name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: buildStdlibFunctionInsertText(fn),
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: GLOBAL_STDLIB_DETAIL + ` ${namespace}`,
        sortText: `2_${namespace}_${fn.name}`,
        filterText: stdlibQualifiedCallName(fn, namespace),
        documentation: buildStdlibHoverMarkdown(fn, namespace),
      });
    }

    for (const constant of group.constants || []) {
      templates.push({
        label: constant.name,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: constant.name,
        detail: GLOBAL_STDLIB_DETAIL + ` ${namespace}.${constant.name}`,
        sortText: `2_${namespace}_${constant.name}`,
        filterText: `${namespace}.${constant.name}`,
        documentation: buildConstantHoverMarkdown(constant),
      });
    }
  }

  return templates;
}

/** @type {import("monaco-editor").languages.CompletionItem[] | null} */
let cachedCompletionTemplates = null;

/**
 * Return cached stdlib completion templates, building them on first use.
 *
 * @returns {import("monaco-editor").languages.CompletionItem[]}
 */
function getStdlibCompletionTemplates() {
  if (!cachedCompletionTemplates) {
    cachedCompletionTemplates = buildStdlibCompletionTemplates(stdlibData);
  }
  return cachedCompletionTemplates;
}

/**
 * @param {import("monaco-editor").languages.CompletionItem} item
 * @returns {string}
 */
function completionItemLabel(item) {
  return typeof item.label === "string" ? item.label : item.label.label;
}

/**
 * Build completion items for one stdlib namespace after a dot trigger.
 *
 * @param {string} namespace Namespace table name (`math`, `string`, ...).
 * @param {string} prefix Lowercase partial member name typed after the dot.
 * @param {import("monaco-editor").IRange} replaceRange Range Monaco replaces on accept.
 * @returns {import("monaco-editor").languages.CompletionItem[]}
 */
function memberCompletionItems(namespace, prefix, replaceRange) {
  const group = stdlibData.namespaces[namespace];
  if (!group) {
    return [];
  }

  const suggestions = [];

  for (const fn of group.functions || []) {
    if (prefix && !fn.name.toLowerCase().startsWith(prefix)) {
      continue;
    }
    suggestions.push({
      label: fn.name,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: buildStdlibFunctionInsertText(fn),
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: GLOBAL_STDLIB_DETAIL + ` ${namespace}`,
      sortText: `2_${namespace}_${fn.name}`,
      documentation: buildStdlibHoverMarkdown(fn, namespace),
      range: replaceRange,
    });
  }

  for (const constant of group.constants || []) {
    if (prefix && !constant.name.toLowerCase().startsWith(prefix)) {
      continue;
    }
    suggestions.push({
      label: constant.name,
      kind: monaco.languages.CompletionItemKind.Constant,
      insertText: constant.name,
      detail: GLOBAL_STDLIB_DETAIL + ` ${namespace}.${constant.name}`,
      sortText: `2_${namespace}_${constant.name}`,
      documentation: buildConstantHoverMarkdown(constant),
      range: replaceRange,
    });
  }

  return suggestions;
}

/**
 * Detect `namespace.member` completion context at the cursor.
 *
 * Returns null when the line prefix before the cursor does not end with a
 * known stdlib namespace followed by a dot (e.g. not `math.`).
 *
 * @param {import("monaco-editor").editor.ITextModel} model
 * @param {import("monaco-editor").Position} position
 * @returns {{ namespace: string, prefix: string, replaceRange: import("monaco-editor").IRange } | null}
 */
function getMemberCompletionContext(model, position) {
  const linePrefix = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
  const match = MEMBER_PREFIX_REGEX.exec(linePrefix);
  if (!match) {
    return null;
  }

  const namespace = match[1];
  const prefix = match[2].toLowerCase();
  if (!(namespace in (stdlibData.namespaces || {}))) {
    return null;
  }

  const dotColumn = position.column - match[2].length - 1;
  const replaceRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: dotColumn + 1,
    endColumn: position.column,
  };

  return { namespace, prefix, replaceRange };
}

/**
 * Register completion for Lua standard library globals and namespace members.
 *
 * Triggered on `.` for member completion (`math.floor`); returns nothing when
 * the prefix is not a known stdlib namespace (avoids polluting `foo.` completions).
 * Otherwise contributes top-level globals (`pairs`, `type`, ...) and namespace
 * tables (`math`, `string`, ...) filtered by the word at the cursor.
 */
export function registerLuaStdlibCompletionProvider() {
  monaco.languages.registerCompletionItemProvider("lua", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position, context) {
      const memberContext = getMemberCompletionContext(model, position);
      if (memberContext) {
        const { namespace, prefix, replaceRange } = memberContext;
        return {
          suggestions: memberCompletionItems(namespace, prefix, replaceRange),
        };
      }

      // Dot-triggered but not a stdlib namespace: suppress globals entirely so
      // we don't pollute completions after e.g. `foo.`.
      if (context.triggerCharacter === ".") {
        return { suggestions: [] };
      }

      const replaceRange = getCompletionReplaceRange(model, position);
      const word = model.getWordUntilPosition(position);
      const prefix = word.word.toLowerCase();
      const templates = getStdlibCompletionTemplates();
      const filtered = prefix
        ? templates.filter((item) => {
            const label = completionItemLabel(item);
            const filterText = item.filterText || label;
            return (
              label.toLowerCase().startsWith(prefix) ||
              filterText.toLowerCase().startsWith(prefix)
            );
          })
        : templates;

      // Top-level globals and namespace tables only (not dotted member aliases).
      const globalSuggestions = filtered
        .filter((item) => TOP_LEVEL_STDLIB_DETAILS.has(item.detail))
        .map((item) => ({ ...item, range: replaceRange }));

      return { suggestions: globalSuggestions };
    },
  });
}

/**
 * Resolve the hover lookup key for the word at the cursor.
 *
 * Returns `namespace.member` when the cursor is on the member side of a dot
 * (e.g. `floor` in `math.floor`), otherwise the bare word (`pairs`).
 *
 * @param {import("monaco-editor").editor.ITextModel} model
 * @param {import("monaco-editor").Position} position
 * @returns {string | null}
 */
function resolveStdlibHoverKey(model, position) {
  const word = model.getWordAtPosition(position);
  if (!word) {
    return null;
  }

  const line = model.getLineContent(position.lineNumber);
  const beforeWord = line.slice(0, word.startColumn - 1);
  if (beforeWord.endsWith(".")) {
    const memberMatch = /([A-Za-z_]\w*)\.$/.exec(beforeWord);
    if (memberMatch) {
      return `${memberMatch[1]}.${word.word}`;
    }
  }

  return word.word;
}

/**
 * Register hover docs for Lua standard library symbols.
 *
 * Uses a prebuilt map from `buildStdlibHoverMap`; SDK hover is registered
 * separately and takes precedence when both match the same bare name.
 */
export function registerLuaStdlibHoverProvider() {
  const hoverMap = buildStdlibHoverMap(stdlibData);

  monaco.languages.registerHoverProvider("lua", {
    provideHover(model, position) {
      const key = resolveStdlibHoverKey(model, position);
      if (!key) {
        return null;
      }

      const markdown = hoverMap.get(key);
      if (!markdown) {
        return null;
      }

      const word = model.getWordAtPosition(position);
      if (!word) {
        return null;
      }

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
