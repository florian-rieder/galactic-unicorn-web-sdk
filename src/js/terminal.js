import { Lua } from "./lua/lua-runtime.js";

const HISTORY_MAX_LENGTH = 25;
// Loop back to the start if we reach the end of history with up arrow
const LOOP_HISTORY_WITH_UP_ARROW = false; // The official Lua interpreter stops at the end.

let output = null;
let input = null;
let buffer = "";
let inputHistory = [];
let historyIndex = -1;

function scrollToBottom() {
  if (!output) return;

  output.scrollTop = output.scrollHeight;
}

function reloadDom() {
  if (!output) return;

  output.textContent = buffer;
  scrollToBottom();
}

function onKeyDown(event) {
  event.stopPropagation();
  // Enter
  if (event.key == "Enter") {
    const statement = input.value.trim();
    if (statement === "") return;

    // Shift the history if we reached its max length (forget oldest)
    if (inputHistory.length >= HISTORY_MAX_LENGTH) {
      inputHistory.shift();
    }

    inputHistory.push(statement);
    Terminal.readEvalPrint(statement);
    historyIndex = -1;
    input.value = "";
  }
  // Arrow up
  else if (event.key == "ArrowUp") {
    event.preventDefault();

    if (inputHistory.length == 0) return;

    if (historyIndex < 0) {
      // < 0 means no history item is currently selected, so start at the latest item
      historyIndex = inputHistory.length - 1;
    } else if (historyIndex == 0) {
      // We reached the end of history: loop back to the start or stop here
      if (LOOP_HISTORY_WITH_UP_ARROW) {
        historyIndex = inputHistory.length - 1;
      }
    } else {
      historyIndex--; // Decrease index -> Go to older
    }

    const statement = inputHistory[historyIndex];
    input.value = statement;
  }
  // Arrow down
  else if (event.key == "ArrowDown") {
    event.preventDefault();

    if (inputHistory.length == 0) return;

    if (historyIndex < 0) {
      // No history item is currently selected, so do nothing
      return;
    } else if (historyIndex >= inputHistory.length - 1) {
      input.value = "";
      historyIndex = -1;
      return;
    } else {
      historyIndex++; // Increase index -> Go to more recent
    }

    const statement = inputHistory[historyIndex];
    input.value = statement;
  }
}

export const Terminal = Object.freeze({
  init() {
    output = document.getElementById("console-output");
    input = document.getElementById("console-input");

    if (input) {
      input.addEventListener("keydown", (event) => onKeyDown(event));
    }

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

  readEvalPrint(expression) {
    if (!Lua.hasSession()) {
      this.printLine(
        "Lua is not running. Press 'Run' to launch Lua with the script open in the editor."
      );
      return;
    }

    this.printLine(`> ${expression}`);

    // Comments
    if (expression.startsWith("--")) return;

    if (expression.startsWith("local ")) {
      this.printLine(
        "warning: locals do not survive across lines in interactive mode"
      );
    }

    // `results` is the return value(s) of the processed expression
    const results = Lua.eval(expression);

    if (results == null) return;
    if (results.length == 0) return;

    // Format multiple values separated by tabs, like the official Lua interpreter
    let resultString = results.join("\t");
    this.printLine(resultString);
  },
});
