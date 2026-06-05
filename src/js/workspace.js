import { FileSystem } from "./file-system.js";
import { MonacoEditor } from "./monaco.js";
import { Terminal } from "./terminal.js";

import defaultSnakeLua from "../lua/snake.lua?raw";

const TEXTISH_EXTENSIONS = ["txt", "lua", "lson", "md", "xml", "json", "csv", "tsv"];
const LUA_EXTENSIONS = ["lua", "lson"];
const DEFAULT_SCRIPT_PATH = "/main.lua";

let currentOpenPath = DEFAULT_SCRIPT_PATH;
let readOnly = false;

/** Called after a successful save so the file tree can refresh (wired from main.js). */
let explorerReloadHandler = () => {};

export const Workspace = Object.freeze({
  /**
   * Register a callback to refresh the file explorer after saves.
   * Wired from main.js to avoid a circular import with file-explorer.js.
   * @param {() => void} handler
   */
  setExplorerReloadHandler(handler) {
    explorerReloadHandler = handler;
  },

  /**
   * Save the currently open file in the editor
   */
  saveCurrentFile() {
    if (readOnly || currentOpenPath === null) {
      return;
    }

    const text = MonacoEditor.getText();
    // Convert text to Uint8Array
    const encoded = new TextEncoder().encode(text);
    // Write file to FS
    if (!FileSystem.writeFile(currentOpenPath, encoded)) {
      Terminal.printLine(`[Error] Failed to save file ${currentOpenPath}`);
      return;
    }
    explorerReloadHandler();
  },

  /**
   * Load and open a certain file into the editor
   * @param {string} path - The path of the file to open.
   */
  openFile(path) {
    const rawFile = FileSystem.readFile(path);
    if (rawFile === null) {
      console.error("Couldn't open file " + path);
      return;
    }

    currentOpenPath = path;

    const extension = path.split(".").slice(-1)[0].toLowerCase();

    if (TEXTISH_EXTENSIONS.includes(extension)) {
      readOnly = false;
      // Plain text file: simply decode the bytes into text
      const decodedString = new TextDecoder().decode(rawFile);

      let language = "plaintext";
      if (LUA_EXTENSIONS.includes(extension)) {
        language = "lua";
      }

      // Load into monaco
      MonacoEditor.setText(decodedString, language, readOnly);
    } else {
      // If we "load" binary as description into the editor we need to NOT save it upon exit!
      readOnly = true;
      // Binary file: show file size
      MonacoEditor.setText(
        `Binary (${FileSystem.fileSizeAtPath(path)} bytes)`,
        "plaintext",
        readOnly
      );
    }
  },

  /**
   * Load the default script if it exists, otherwise create it.
   *
   * Design decision: there will always be a default script in the file system.
   * If it doesn't exist, create it.
   */
  maybeLoadDefaultScript() {
    if (FileSystem.fileExists(DEFAULT_SCRIPT_PATH)) {
      // Open the default file from the file system
      this.openFile(DEFAULT_SCRIPT_PATH);
    } else {
      // Set default script
      MonacoEditor.setText(defaultSnakeLua, "lua", false);
      this.saveCurrentFile(); // Create the default file in the file system
    }
  },

  /**
   * Get the path of the currently open file.
   * @returns {string} The path of the currently open file.
   */
  getCurrentOpenPath() {
    return currentOpenPath;
  },

  /**
   * Handle the event of a file being removed.
   * @param {string} path - The path of the file that was removed.
   */
  onFileRemoved(path) {
    // If the currently opened file was removed
    if (currentOpenPath !== path) {
      return;
    }

    // Open main if it exists, otherwise create the default script.
    this.maybeLoadDefaultScript();
  },

  /**
   * Handle the event of a file being renamed.
   * @param {string} oldPath - The old path of the file.
   * @param {string} newPath - The new path of the file.
   */
  onFileRenamed(oldPath, newPath) {
    // Update the currentOpenPath
    if (currentOpenPath === oldPath) {
      currentOpenPath = newPath;
    }
  },
});
