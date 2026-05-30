import { Display } from "./display.js";
import { initResizers } from "./resizer.js";
import {
  initLua,
  runLua,
  closeLua,
  lua_callback_onPress,
  lua_callback_onRelease,
  lua_callback_setup,
  lua_callback_update,
  lua_callback_draw,
} from "./lua.js";
import { stopMusic } from "./music.js";
import { initFileExplorer } from "./file-explorer.js";
import { initMonaco, getEditorText } from "./monaco.js";
import {
  initWorkspace,
  maybeLoadDefaultScript,
  getCurrentOpenPath,
} from "./workspace.js";
import { Input, KEY_MAP } from "./input.js";

// Initialize components and set up the initial state of the application.

await initMonaco();
maybeLoadDefaultScript();

initResizers();
initFileExplorer();
initWorkspace();

Display.render(); // Render the initial state of the display

const TARGET_FPS = 60;
const TARGET_DELTA_TIME = 1000 / TARGET_FPS;

let lastTime = null;
let deltaTime = null;
let now = null;
let frameId = null;
let timeoutId = null;
let isRunning = false;

// Toolbar control buttons
const runButton = document.getElementById("run-button");
const stopButton = document.getElementById("stop-button");
runButton.addEventListener("click", startSession);
stopButton.addEventListener("click", stopSession);

/**
 * Clear the set of pressed keys when the window loses focus.
 */
window.addEventListener("blur", () => {
  Input.clearPressedKeys();
});

/**
 * Handle the event of a key being pressed.
 * @param {KeyboardEvent} event - The keyboard event.
 */
window.addEventListener("keydown", (event) => {
  // If a script is running
  if (!isRunning) return;

  const key = KEY_MAP[event.key];
  // If the key corresponds to a button on the device
  if (!key) return;

  // If the key is not already pressed
  if (Input.isPressed(key)) return;

  Input.markPressed(key);

  // Signal lua the button has been pressed.
  lua_callback_onPress(key);
});

/**
 * Handle the event of a key being released.
 * @param {KeyboardEvent} event - The keyboard event.
 */
window.addEventListener("keyup", (event) => {
  // If a script is running
  if (!isRunning) return;

  const key = KEY_MAP[event.key];
  // If the key corresponds to a button on the device
  if (!key) return;

  Input.markReleased(key);

  // Signal lua the button has been released.
  lua_callback_onRelease(key);
});

/**
 * Start a Lua session with the current open buffer as entrypoint
 */
function startSession() {
  // If a loop is already running, stop it.
  if (frameId != null || timeoutId != null) {
    stopSession();
  }

  // Clear any held keys from the previous session.
  Input.clearPressedKeys();

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
  const setupStatus = lua_callback_setup();
  if (setupStatus === "error") {
    stopSession();
    return;
  }

  isRunning = true;
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
  isRunning = false;
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
  const updateStatus = lua_callback_update(deltaTime / 1000.0); // Convert milliseconds to seconds
  if (updateStatus === "error") {
    stopSession();
    return;
  }

  const drawStatus = lua_callback_draw();
  if (drawStatus === "error") {
    stopSession();
    return;
  }

  // Render the display buffer to the canvas.
  Display.render();

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
