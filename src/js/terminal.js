import { Lua, g_luaState } from "./lua/lua-runtime";

let output = null;
let input = null;
let buffer = "";
let inputHistory = [];
let historyIndex = -1;
const ASSIGNMENT_PATTERN = new RegExp("(?<![=~^><])=(?!=)"); // https://regex101.com/r/eVIUzS/1

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

          inputHistory.push(statement);

          input.value = "";
          this.readEvalPrint(statement);
          historyIndex = -1;
        } else if (event.key == "ArrowUp") {
          event.preventDefault();

          if (inputHistory.length == 0) return;

          if (historyIndex <= 0) {
            historyIndex = inputHistory.length;
          }
          historyIndex--;

          const statement = inputHistory[historyIndex];
          input.value = statement;
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

  readEvalPrint(statement) {
    if (g_luaState == null) {
      this.printLine(
        "Lua is not running. Press 'Run' to launch Lua with the script open in the editor."
      );
      return;
    }

    this.printLine(`> ${statement}`);

    let editedStatement = statement;

    if (statement.startsWith("--")) return;

    if (!statement.match(ASSIGNMENT_PATTERN)) {
      if (!statement.startsWith("return")) {
        // Wrap the expression in a return statement so it returns a value we can print
        editedStatement = `return ${statement}`;
      }
    }

    const results = Lua.eval(editedStatement);

    if (results == null) return;

    for (const result of results) {
      this.printLine(result);
    }
  },
});
