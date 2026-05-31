/**
 * SDK autocompletion (snippets + docs) and hover tooltips.
 *
 * Data source: public/docs/lua-api.json (generated from lua.js).
 * + in-file symbols from lua-symbols.js (basic autocompletion)
 *
 * SDK item templates are cached after first load; only `range` is re-applied per
 * request because Monaco mutates completion objects in place.
 */
import * as monaco from "./custom-monaco.js";
import {
  collectDocumentSymbols,
  documentSymbolsToCompletionItems,
  getCompletionReplaceRange,
} from "./lua-symbols.js";

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
  // Monaco snippet syntax: ${1:placeholder}. Built as string to avoid template escaping.
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

/** @type {object | null} */
let cachedSdkApi = null;
/** @type {import("monaco-editor").languages.CompletionItem[] | null} */
let cachedSdkCompletionItems = null;

function completionItemLabel(item) {
  return typeof item.label === "string" ? item.label : item.label.label;
}

function buildSdkCompletionItemTemplates(api) {
  const functionSuggestions = (api.functions || []).map((item) => ({
    label: item.lua_name,
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: buildSdkFunctionInsertText(item),
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: "[SDK Function]",
    sortText: `1_${item.lua_name}`,
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
    sortText: `1_${cb.lua_name}`,
    documentation: buildHoverMarkdown(cb),
  }));

  const constantSuggestions = (api.constants || []).map((item) => ({
    label: item.name,
    kind: monaco.languages.CompletionItemKind.Constant,
    insertText: item.name,
    detail: `[SDK Constant] ${item.type}`,
    sortText: `1_${item.name}`,
    documentation: `${item.description}\n\nValue: \`${item.value_expression}\``,
  }));

  return [
    ...functionSuggestions,
    ...callbackSuggestions,
    ...constantSuggestions,
  ];
}

function getSdkCompletionItemTemplates(api) {
  if (!api) return [];
  if (cachedSdkApi === api && cachedSdkCompletionItems) {
    return cachedSdkCompletionItems;
  }
  cachedSdkApi = api;
  cachedSdkCompletionItems = buildSdkCompletionItemTemplates(api);
  return cachedSdkCompletionItems;
}

function sdkCompletionItemsForRequest(api, replaceRange, prefix) {
  const templates = getSdkCompletionItemTemplates(api);
  const filtered = prefix
    ? templates.filter((item) =>
        completionItemLabel(item).toLowerCase().startsWith(prefix),
      )
    : templates;
  // Shallow copy + range: templates are cached without range on purpose.
  return filtered.map((item) => ({ ...item, range: replaceRange }));
}

/**
 * Register completion for SDK symbols plus in-file locals/functions.
 *
 * @param {() => object | null} getApi Returns loaded `lua-api.json`, or null.
 */
export function registerLuaCompletionProvider(getApi) {
  // Completion is registered from generated API metadata.
  // This keeps Monaco behavior in sync with the docs page and `lua.js`.
  // In-file symbols (locals, functions, etc.) are merged on every request.
  monaco.languages.registerCompletionItemProvider("lua", {
    provideCompletionItems(model, position) {
      // Build fresh completion items on every request. Monaco mutates some
      // item fields internally (like ranges), so reusing old objects can
      // produce invalid-completion warnings when the cursor moves.
      const replaceRange = getCompletionReplaceRange(model, position);
      const word = model.getWordUntilPosition(position);
      const prefix = word.word.toLowerCase();

      const documentSymbols = collectDocumentSymbols(model.getValue());
      const documentSuggestions = documentSymbolsToCompletionItems(
        monaco,
        documentSymbols,
        replaceRange,
        prefix,
      );

      const api = getApi();
      const sdkSuggestions = api
        ? sdkCompletionItemsForRequest(api, replaceRange, prefix)
        : [];

      return {
        suggestions: [...documentSuggestions, ...sdkSuggestions],
      };
    },
  });
}

/**
 * Register hover docs for SDK symbols from generated API metadata.
 *
 * @param {object} api Parsed `lua-api.json`.
 */
export function registerLuaHoverProvider(api) {
  // Hover is registered from the same generated API metadata as completions.
  // This keeps Monaco behavior in sync with the docs page and `lua.js`.
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
