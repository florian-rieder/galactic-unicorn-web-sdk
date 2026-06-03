const output = document.getElementById("console-output");
const container = document.getElementById("console");

function scrollToBottom() {
  container.scrollTop = container.scrollHeight;
}

export const Terminal = Object.freeze({
  print(message) {
    output.textContent += message;
    scrollToBottom();
  },
  printLine(message) {
    output.textContent += message + "\n";
    scrollToBottom();
  },
  clear() {
    output.textContent = "";
  },
});
