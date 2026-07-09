import { Lua, g_luaState } from "./lua/lua-runtime";

const HISTORY_MAX_LENGTH = 25;
const ASSIGNMENT_PATTERN = new RegExp("(?<![=~^><])=(?!=)"); // https://regex101.com/r/eVIUzS/1

let output = null;
let input = null;
let buffer = "";
let inputHistory = [];
let historyIndex = -1;

function scrollToBottom() {
  if (output) {
    output.scrollTop = output.scrollHeight;
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
    input = document.getElementById("console-input");

    if (input) {
      input.addEventListener("keydown", (event) => {
        if (event.key == "Enter") {
          event.preventDefault();

          const statement = input.value.trim();
          if (statement === "") return;

          if (inputHistory.length >= HISTORY_MAX_LENGTH) {
            inputHistory.shift();
          }

          inputHistory.push(statement);

          this.readEvalPrint(statement);

          historyIndex = -1;
          input.value = "";
        } else if (event.key == "ArrowUp") {
          event.preventDefault();

          if (inputHistory.length == 0) return;

          if (historyIndex <= 0) {
            historyIndex = inputHistory.length; // Loop around
          }
          historyIndex--;
          const statement = inputHistory[historyIndex];
          input.value = statement;
        } else if (event.key == "ArrowDown") {
          event.preventDefault();

          if (inputHistory.length == 0) return;

          if (historyIndex >= inputHistory.length || historyIndex < 0) {
            input.value = "";
            return;
          }
          const statement = inputHistory[historyIndex];
          input.value = statement;
          historyIndex++;
        }
      });
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
    if (g_luaState == null) {
      this.printLine(
        "Lua is not running. Press 'Run' to launch Lua with the script open in the editor."
      );
      return;
    }

    this.printLine(`> ${expression}`);

    let processedExpression = expression;

    // Comments
    if (expression.startsWith("--")) return;

    // Wrap the expression the start of the statement in a return statement so it returns a value we
    // can print,
    // if the expression doesn't already start with a return statement and
    // if there isn't an assignment in the expression (`x = y`)
    if (!expression.match(ASSIGNMENT_PATTERN)) {
      if (!expression.startsWith("return")) {
        processedExpression = `return ${expression}`;
      }
    }

    // `results` is the return value(s) of the processed expression
    const results = Lua.eval(processedExpression);

    if (results == null) return;
    if (results.length == 0) return;

    for (const result of results) {
      this.printLine(result);
    }
  },
});
