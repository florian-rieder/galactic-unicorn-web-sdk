const output = document.getElementById("console-output");

export const Terminal = Object.freeze({
  print(message) {
    output.textContent += message;
  },
  printLine(message) {
    output.textContent += message + "\n";
  },
  clear() {
    output.textContent = "";
  },
});
