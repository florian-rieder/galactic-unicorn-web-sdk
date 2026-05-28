import { fileExists, fileSizeAtPath, listFiles, readFile, writeFile } from "./file-system.js";
import { getEditorText, setEditorText } from "./monaco";
import defaultSnakeLua from "../lua/snake.lua?raw";

const TEXTISH_EXTENSIONS = ["txt", "lua"];
const DEFAULT_SCRIPT_PATH = "/main.lua"

let currentOpenPath = DEFAULT_SCRIPT_PATH;

export function initWorkspace() {
  window.addEventListener("keydown", (event) => {
    // on CTRL+S or CMD+S
    if (
      (event.key === "s" && event.ctrlKey) ||
      (event.key === "s" && event.metaKey)
    ) {
      event.preventDefault();
      saveCurrentFile();
    }
  });
}

// Save the currently open file in the editor
export function saveCurrentFile() {
  if (currentOpenPath === null) {
    return;
  }

  const text = getEditorText();
  // Convert text to Uint8Array
  const encoded = new TextEncoder().encode(text);
  // Write file to FS
  writeFile(currentOpenPath, encoded);
}

// Load and open a certain file into the editor
export function openFile(path) {
  const rawFile = readFile(path);
  if (rawFile === null) {
    console.error("Couldn't open file " + path);
    return;
  }

  const extension = path.split(".").slice(-1)[0];

  if (TEXTISH_EXTENSIONS.includes(extension)) {
    // Plain text file: simply decode the bytes into text
    const decodedString = new TextDecoder().decode(rawFile);
    // Load into monaco
    setEditorText(decodedString);
    currentOpenPath = path;
  } else {
    // Binary file: show file size
    setEditorText(`Binary (${fileSizeAtPath(path)} bytes)`)
    // If we load binary into the editor we need to NOT save it upon exit!
    currentOpenPath = null;
  }

}

export function maybeLoadDefaultScript() {
  if (fileExists(DEFAULT_SCRIPT_PATH)) {
    openFile(DEFAULT_SCRIPT_PATH);
  } else {
    // Set default script
    setEditorText(defaultSnakeLua);
    saveCurrentFile();
  }
}

export function getCurrentOpenPath() {
  return currentOpenPath;
}

export function onFileRemoved(path) {
  // If the currently opened file was removed, open one of the remaining files.
  if (currentOpenPath !== path) {
    return;
  }

  const remaining = listFiles()
    .filter((filePath) => filePath !== path)
    .sort();
  if (remaining.length > 0) {
    // Open the first remaining file
    openFile(remaining[0]);
  } else {
    setEditorText("");
    currentOpenPath = DEFAULT_SCRIPT_PATH;
  }
}

export function onFileRenamed(oldPath, newPath) {
  // Update the currentOpenPath
  if (currentOpenPath === oldPath) {
    currentOpenPath = newPath;
  }
}