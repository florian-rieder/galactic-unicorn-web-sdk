import { render } from "./display.js";
import { initResizers } from "./resizer.js";
import { initLua, runLua, closeLua, luaCallIfExists } from "./lua.js";
import { stopMusic } from "./music.js";
import { initFileExplorer } from "./file-explorer.js";
import { initMonaco, getEditorText } from "./monaco.js";
import {
  initWorkspace,
  maybeLoadDefaultScript,
  getCurrentOpenPath,
} from "./workspace.js";

// Initialize components and set up the initial state of the application.

await initMonaco();
maybeLoadDefaultScript();

initResizers();
initFileExplorer();
initWorkspace();

render(); // Render the initial state of the display

const TARGET_FPS = 60;
const TARGET_DELTA_TIME = 1000 / TARGET_FPS;

let lastTime = null;
let deltaTime = null;
let now = null;
let frameId = null;
let timeoutId = null;

// Toolbar control buttons
const runButton = document.getElementById("run-button");
const stopButton = document.getElementById("stop-button");
runButton.addEventListener("click", startSession);
stopButton.addEventListener("click", stopSession);

/**
 * Start a Lua session with the current open buffer as entrypoint
 */
function startSession() {
  // If a loop is already running, stop it.
  if (frameId != null || timeoutId != null) {
    stopSession();
  }

  // Initialize the Lua session.
  initLua();

  // Load the currently open script into Lua
  const script = getEditorText();
  const scriptFilePath = getCurrentOpenPath();

  // Execute the script. If it fails, stop the session.
  if (!runLua(script, scriptFilePath)) {
    stopSession();
    return;
  }

  // Call the setup function if it's defined in the lua script.
  // Missing callbacks are allowed; runtime errors stop the execution of the loop.
  const setupStatus = luaCallIfExists("setup");
  if (setupStatus === "error") {
    stopSession();
    return;
  }

  // Start the main loop
  frameId = requestAnimationFrame(mainLoop);
}

/**
 * Stop and cleanup the Lua session and associated resources.
 */
function stopSession() {
  closeLua();
  stopMusic();
  cancelAnimationFrame(frameId);
  clearTimeout(timeoutId);
  lastTime = null;
  frameId = null;
  timeoutId = null;
}

/**
 * Run the main loop of the Lua program (update/draw)
 */
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
  if (updateStatus === "error") {
    stopSession();
    return;
  }

  const drawStatus = luaCallIfExists("draw");
  if (drawStatus === "error") {
    stopSession();
    return;
  }

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
