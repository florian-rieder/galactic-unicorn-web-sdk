import { KeyCode, MonacoEditor } from "./monaco.js";
import { Lua } from "./lua/lua-runtime.js";
import { BuiltinFiles } from "./fs/builtin-files.js";
import { Display } from "./display.js";
import { initResizers } from "./ui/resizer.js";
import { FileExplorer } from "./file-explorer.js";
import { Workspace } from "./workspace.js";
import { Input } from "./input.js";
import { flashWithUi } from "./flash-ui.js";

// Initialize components and set up the initial state of the application.

await Promise.all([BuiltinFiles.load(), MonacoEditor.init()]);
// Register keyboard shortcuts for when monaco is in focus
MonacoEditor.registerControlShortcut(KeyCode.KeyS, Workspace.saveCurrentFile);
MonacoEditor.registerControlShortcut(KeyCode.Enter, startSession);
MonacoEditor.registerControlShortcut(KeyCode.Escape, stopSession);
Workspace.init();
Workspace.setExplorerReloadHandler(() => FileExplorer.reload());
initResizers();
FileExplorer.reload();
Display.render(); // Render the initial state of the display

const TARGET_FPS = 60;
const TARGET_DELTA_TIME = 1000 / TARGET_FPS;

let lastProcessTime = null;
let lastFrameTime = null;
let now = null;
let frameId = null;
let isRunning = false;

// Toolbar control buttons
const runButton = document.getElementById("run-btn");
const stopButton = document.getElementById("stop-btn");
const flashButton = document.getElementById("flash-btn");
runButton.addEventListener("click", startSession);
stopButton.addEventListener("click", stopSession);
flashButton.addEventListener("click", startFlash);

/**
 * Flash project files to the connected ESP device.
 */
async function startFlash() {
  Workspace.saveCurrentFile();
  flashButton.disabled = true;
  try {
    await flashWithUi();
  } finally {
    flashButton.disabled = false;
  }
}

/**
 * Save the currently open file when CTRL+S or CMD+S is pressed.
 * @param {KeyboardEvent} event - The keyboard event.
 */
window.addEventListener("keydown", (event) => {
  // Save shortcut: CTRL+S or CMD+S
  if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    Workspace.saveCurrentFile();
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    // Run shortcut: CTRL+ENTER or CMD+ENTER
    event.preventDefault();
    startSession();
  } else if (event.key === "Escape" && (event.ctrlKey || event.metaKey)) {
    // Stop shortcut: CTRL+ESC or CMD+ESC
    event.preventDefault();
    stopSession();
  }
});

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

  const key = Input.getKeyName(event.key);

  // If the key corresponds to a button on the device
  if (!key) return;

  // If the key is not already pressed
  if (Input.isPressed(key)) return;

  Input.markPressed(key);

  // Signal lua the button has been pressed.
  Lua.callIfExists("on_press", key);
});

/**
 * Handle the event of a key being released.
 * @param {KeyboardEvent} event - The keyboard event.
 */
window.addEventListener("keyup", (event) => {
  // If a script is running
  if (!isRunning) return;

  const key = Input.getKeyName(event.key);

  // If the key corresponds to a button on the device
  if (!key) return;

  Input.markReleased(key);

  // Signal lua the button has been released.
  Lua.callIfExists("on_release", key);
});

/**
 * Start a Lua session with the current open buffer as entrypoint
 */
function startSession() {
  // If a loop is already running, stop it.
  if (frameId != null) {
    stopSession();
  }

  // Clear any held keys from the previous session.
  Input.clearPressedKeys();

  // Initialize the Lua session.
  Lua.init();

  // Load the currently open script into Lua
  const script = MonacoEditor.getText();
  const scriptFilePath = Workspace.getCurrentOpenPath();

  // Execute the script. If it fails, stop the session.
  if (!Lua.run(script, scriptFilePath)) {
    stopSession();
    return;
  }

  // Call the setup function if it's defined in the lua script.
  // Missing callbacks are allowed; runtime errors stop the execution of the loop.
  const setupStatus = Lua.callIfExists("setup");
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
  Lua.close();
  cancelAnimationFrame(frameId);
  lastFrameTime = null;
  frameId = null;
  isRunning = false;
}

function waitForNextFrame() {
  const currentTime = performance.now();
  return currentTime - lastFrameTime < TARGET_DELTA_TIME;
}

/**
 * Run the main loop of the Lua program (update/draw)
 */
function mainLoop() {
  now = performance.now();

  let processDeltaTime = 0;
  if (lastProcessTime != null) {
    processDeltaTime = now - lastProcessTime;
  }
  lastProcessTime = now;

  Lua.callIfExists("process", processDeltaTime / 1000.0);

  if (waitForNextFrame()) {
    frameId = requestAnimationFrame(mainLoop);
    return;
  }

  let deltaTime = 0;

  if (lastFrameTime != null) {
    deltaTime = now - lastFrameTime;
  }
  lastFrameTime = now;

  // Run update then draw from the lua script.
  // Missing callbacks are allowed; runtime errors stop the loop.
  const updateStatus = Lua.callIfExists("update", deltaTime / 1000.0); // Convert milliseconds to seconds
  if (updateStatus === "error") {
    stopSession();
    return;
  }

  const drawStatus = Lua.callIfExists("draw");
  if (drawStatus === "error") {
    stopSession();
    return;
  }

  // Render the display buffer to the canvas.
  Display.render();

  frameId = requestAnimationFrame(mainLoop);
}
