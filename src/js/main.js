import { render } from "./display.js";
import { initResizers } from "./resizer.js";
import { initLua, runLua, closeLua, luaCallIfExists } from "./lua.js";
import { stopMusic } from "./music.js";

initResizers();
render(); // Render the initial state of the display

const targetDeltaTime = 1000 / 30; // 30fps

// Toolbar control buttons
const runButton = document.getElementById("run-button");
const stopButton = document.getElementById("stop-button");
runButton.addEventListener("click", start);
stopButton.addEventListener("click", stop);

function start() {
  // If a loop is already running, stop it.
  if (frameId != null || timeoutId != null) {
    stop();
  }

  const code = window.editor.getValue();
  // Initialize the Lua session.
  initLua();
  // Load the code into Lua
  if (runLua(code) === false) {
    throw new Error("Failed to run the code.");
  }

  // Call the setup function if it's defined in the lua script.
  luaCallIfExists("setup");

  // Start the main loop
  frameId = requestAnimationFrame(mainLoop);
}

function stop() {
  closeLua();
  stopMusic();
  lastTime = null;
  cancelAnimationFrame(frameId);
  clearTimeout(timeoutId);
  frameId = null;
  timeoutId = null;
}

let lastTime = null;
let deltaTime = null;
let now = null;
let frameId = null;
let timeoutId = null;

function mainLoop() {
  now = performance.now();
  if (lastTime == null) {
    deltaTime = 0;
  } else {
    deltaTime = now - lastTime;
  }
  lastTime = now;

  // Run update then draw from the lua script.
  // Missing callbacks are allowed; runtime errors stop the loop.
  const updateStatus = luaCallIfExists("update", deltaTime / 1000.0); // Convert milliseconds to seconds
  if (updateStatus === "error") return;
  const drawStatus = luaCallIfExists("draw");
  if (drawStatus === "error") return;
  // Render the display buffer to the canvas.
  render();

  // Time management: aim for a 30fps update rate.
  const timeToWait = targetDeltaTime - deltaTime;
  if (timeToWait > 0) {
    timeoutId = setTimeout(() => {
      frameId = requestAnimationFrame(mainLoop);
    }, timeToWait);
  } else {
    frameId = requestAnimationFrame(mainLoop);
  }
}
