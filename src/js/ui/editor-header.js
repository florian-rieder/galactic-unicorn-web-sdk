const header = document.getElementById("editor-header");
const pathEl = document.getElementById("editor-header-path");
const actionsEl = document.getElementById("editor-header-actions");
const badgeEl = document.getElementById("editor-header-badge");
const copyBtn = document.getElementById("editor-header-copy-btn");

const HEADER_MODES = ["empty", "user", "builtin"];

/**
 * @param {string} path
 * @returns {string}
 */
function formatDisplayPath(path) {
  if (path.startsWith("/")) {
    return path.slice(1);
  }
  return path;
}

/**
 * @param {"empty" | "user" | "builtin"} mode
 */
function setHeaderMode(mode) {
  for (const name of HEADER_MODES) {
    header.classList.toggle(`editor-header--${name}`, name === mode);
  }
}

export const EditorHeader = Object.freeze({
  /**
   * Wire the copy-to-project button. Call once at startup.
   *
   * @param {() => void} onCopy
   */
  init(onCopy) {
    copyBtn.addEventListener("click", onCopy);
    EditorHeader.showEmpty();
  },

  showEmpty() {
    setHeaderMode("empty");
    pathEl.textContent = "No file open";
    pathEl.classList.add("editor-header-path--muted");
    pathEl.removeAttribute("title");
    actionsEl.hidden = true;
    badgeEl.hidden = true;
    copyBtn.hidden = true;
  },

  /**
   * @param {string} path
   * @param {{ isBuiltIn?: boolean }} options
   */
  showFile(path, { isBuiltIn = false } = {}) {
    const displayPath = formatDisplayPath(path);
    pathEl.textContent = displayPath;
    pathEl.title = path;
    pathEl.classList.remove("editor-header-path--muted");

    if (isBuiltIn) {
      setHeaderMode("builtin");
      actionsEl.hidden = false;
      badgeEl.hidden = false;
      copyBtn.hidden = false;
      return;
    }

    setHeaderMode("user");
    actionsEl.hidden = true;
    badgeEl.hidden = true;
    copyBtn.hidden = true;
  },
});
