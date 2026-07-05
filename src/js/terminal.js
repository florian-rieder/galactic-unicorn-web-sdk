let output = null;
let container = null;
let buffer = "";

function scrollToBottom() {
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function reloadDom() {
  if (output) {
    output.textContent = buffer;
    scrollToBottom();
  }
}

export const Terminal = Object.freeze({
  /**
   * Bind console DOM elements. Safe to skip in tests; output stays in the in-memory buffer.
   */
  init() {
    output = document.getElementById("console-output");
    container = document.getElementById("console");
    reloadDom();
  },

  print(message) {
    buffer += message;
    reloadDom();
  },

  printLine(message) {
    buffer += message + "\n";
    reloadDom();
  },

  clear() {
    buffer = "";
    reloadDom();
  },
});
