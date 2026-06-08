/**
 * Yellow inline styling for SDK function/callback/constant names.
 *
 * Uses Monaco "decorations" (CSS classes on text ranges), not the syntax tokenizer.
 * Only the visible viewport is scanned so large files stay responsive.
 */
import * as monaco from "./custom-monaco.js";

const UPDATE_TIMEOUT_DURATION_MS = 100;
const HIGHLIGHT_STYLE_ID = "sdk-api-highlight-style";

function escapeRegExp(lit) {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function injectSdkHighlightStyle() {
  // Monaco decorations are styled through regular CSS classes.
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
.sdk-api-symbol {
  color: #ffd166 !important;
}
`;
  document.head.appendChild(style);
}

/**
 * Collect SDK symbol names from generated API metadata.
 *
 * @param {object} api
 * @returns {string[]}
 */
function collectSdkSymbolNames(api) {
  const names = [
    ...(api.functions || []).map((f) => f.lua_name),
    ...(api.callbacks || []).map((c) => c.lua_name),
    ...(api.constants || []).map((c) => c.name),
  ];
  return [...new Set(names)].filter(Boolean);
}

/**
 * Highlight SDK function/callback/constant names in the visible editor range.
 *
 * @param {import("monaco-editor").editor.IStandaloneCodeEditor} editor
 * @param {object} api Generated `lua-api.json` payload.
 */
export function installSdkNameHighlights(editor, api) {
  if (!api) return;
  injectSdkHighlightStyle();

  const model = editor.getModel();
  if (!model) return;

  const uniqueNames = collectSdkSymbolNames(api);
  if (uniqueNames.length === 0) return;

  const escaped = uniqueNames.map(escapeRegExp);
  // One big alternation: \b(?:clear|set_pixel|…)\b
  const regex = new RegExp(`\\b(?:${escaped.join("|")})\\b`, "g");

  // One collection, replaced on each scan.
  const decorations = editor.createDecorationsCollection();
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
    // Gate SDK highlighting to only work on lua language
    if (model.getLanguageId() !== "lua") {
      decorations.clear();
      return;
    }
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
              end.column
            ),
            options: { inlineClassName: "sdk-api-symbol" },
          });
        }

        match = regex.exec(rangeText);
      }
    }

    decorations.set(matches);
  }

  function scheduleUpdate() {
    // Debounce decoration updates so fast typing/scrolling does not trigger
    // a full visible-range scan on every single event.
    if (updateTimeoutId != null) clearTimeout(updateTimeoutId);
    updateTimeoutId = setTimeout(
      () => computeDecorations(),
      UPDATE_TIMEOUT_DURATION_MS
    );
  }

  // Initial render + updates on edits.
  computeDecorations();
  editor.onDidChangeModelContent(() => scheduleUpdate());
  editor.onDidScrollChange(() => scheduleUpdate());
}
