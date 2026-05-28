import { render } from "./display.js";
import { initResizers } from "./resizer.js";
import { initLua, runLua, closeLua, luaCallIfExists } from "./lua.js";
import { stopMusic } from "./music.js";
import { writeFile } from "./file-system.js";
import { initFileExplorer } from "./file-explorer.js";
import { initMonaco, getEditorText } from "./monaco.js";
import { initWorkspace, maybeLoadDefaultScript } from "./workspace.js";

await initMonaco();
maybeLoadDefaultScript();

initResizers();
initFileExplorer();
initWorkspace();

render(); // Render the initial state of the display

const TARGET_FPS = 60;
const TARGET_DELTA_TIME = 1000 / TARGET_FPS;

// Toolbar control buttons
const runButton = document.getElementById("run-button");
const stopButton = document.getElementById("stop-button");
runButton.addEventListener("click", startSession);
stopButton.addEventListener("click", stopSession);

function startSession() {
  // If a loop is already running, stop it.
  if (frameId != null || timeoutId != null) {
    stopSession();
  }

  const code = getEditorText();
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

function stopSession() {
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

  // Time management: aim for a TARGET_FPS update rate.
  const timeToWait = TARGET_DELTA_TIME - deltaTime;
  if (timeToWait > 0) {
    timeoutId = setTimeout(() => {
      frameId = requestAnimationFrame(mainLoop);
    }, timeToWait);
  } else {
    frameId = requestAnimationFrame(mainLoop);
  }
}
