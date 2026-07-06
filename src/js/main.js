import { KeyCode, MonacoEditor } from "./monaco.js";
import { Lua } from "./lua/lua-runtime.js";
import { BuiltinFiles } from "./fs/builtin-files.js";
import { Display } from "./display.js";
import { Terminal } from "./terminal.js";
import { initResizers } from "./ui/resizer.js";
import { FileExplorer } from "./file-explorer.js";
import { Workspace } from "./workspace.js";
import { Input } from "./input.js";
import { flashWithUi } from "./flash-ui.js";

// Constants
const TARGET_FPS = 60;
const TARGET_DELTA_TIME_MS = 1000 / TARGET_FPS;
const DEFAULT_INPUT_REPEAT_DELAY_S = 0.25;
const DEFAULT_INPUT_REPEAT_INTERVAL_S = 0.1;

// State
let lastProcessTime = null;
let lastFrameTime = null;
let now = null;
let frameId = null;
let isRunning = false;
let isPaused = false;

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
Terminal.init();
Display.init();

// Toolbar control buttons
const runButton = document.getElementById("run-btn");
const pauseButton = document.getElementById("pause-btn");
const stepButton = document.getElementById("step-btn");
const stopButton = document.getElementById("stop-btn");
const flashButton = document.getElementById("flash-btn");
runButton.addEventListener("click", startSession);
pauseButton.addEventListener("click", togglePauseSession);
stepButton.addEventListener("click", stepSession);
stopButton.addEventListener("click", stopSession);
flashButton.addEventListener("click", startFlash);

updateSessionButtons();

/**
 * Sync the enabled/disabled state of the session control buttons with the current session state.
 */
function updateSessionButtons() {
  pauseButton.disabled = !isRunning;
  stepButton.disabled = !isPaused;
  stopButton.disabled = !isRunning;
}

/**
 * Flash project files to the connected ESP device.
 * @returns {Promise<void>}
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

// Clear the set of pressed keys when the window loses focus.
window.addEventListener("blur", () => {
  Input.clearPressedKeys();
});

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
  // Set/reset default repeat delay and interval
  Input.setRepeatDelay(DEFAULT_INPUT_REPEAT_DELAY_S);
  Input.setRepeatInterval(DEFAULT_INPUT_REPEAT_INTERVAL_S);

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
  isPaused = false;
  updateSessionButtons();
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
  lastProcessTime = null;
  frameId = null;
  isRunning = false;
  isPaused = false;
  updateSessionButtons();
}

function togglePauseSession() {
  if (isPaused) {
    // Unpause
    isPaused = false;
    lastFrameTime = null;
    lastProcessTime = null;
    // Restart the main loop
    frameId = requestAnimationFrame(mainLoop);
  } else {
    // Pause
    isPaused = true;
    cancelAnimationFrame(frameId);
  }
  updateSessionButtons();
}

function stepSession() {
  if (!isPaused) return;

  Lua.callIfExists("update", TARGET_DELTA_TIME_MS / 1000.0);
  Lua.callIfExists("draw");

  Display.render();
}

function waitForNextFrame() {
  if (lastFrameTime == null) {
    return false;
  }

  const currentTime = performance.now();
  return currentTime - lastFrameTime < TARGET_DELTA_TIME_MS;
}

/**
 * Run the main loop of the Lua program (process/update/draw)
 */
function mainLoop() {
  now = performance.now();

  let processDeltaTime = 0;
  if (lastProcessTime != null) {
    processDeltaTime = (now - lastProcessTime) / 1000.0; // Convert milliseconds to seconds
  }
  lastProcessTime = now;

  const processStatus = Lua.callIfExists("process", processDeltaTime);
  if (processStatus === "error") {
    stopSession();
    return;
  }

  // For each held key, process repeat signal
  Input.processRepeat((key) => Lua.callIfExists("on_repeat", key));

  if (waitForNextFrame()) {
    frameId = requestAnimationFrame(mainLoop);
    return;
  }

  let updateDeltaTime = 0;
  if (lastFrameTime != null) {
    updateDeltaTime = (now - lastFrameTime) / 1000.0;
  }
  lastFrameTime = now;

  // Run update then draw from the lua script.
  // Missing callbacks are allowed; runtime errors stop the loop.
  const updateStatus = Lua.callIfExists("update", updateDeltaTime);
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
