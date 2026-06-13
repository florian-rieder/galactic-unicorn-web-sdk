import Swal from "sweetalert2";

import { FileSystem } from "./fs/file-system.js";
import { BuiltinFiles } from "./fs/builtin-files.js";
import { MonacoEditor } from "./monaco.js";
import { Terminal } from "./terminal.js";

import luaManifestTemplate from "../lua/templates/manifest.lua?raw";
import luaMainTemplate from "../lua/templates/main.lua?raw";

const DEFAULT_PROJECT_NAME = "My project";
const TEXTISH_EXTENSIONS = ["txt", "lua", "md", "xml", "json", "csv", "tsv"];

let currentOpenPath = null;
let isBuiltIn = false; // is the currently open file built-in ?
let readOnly = false; // is the currently open file read-only ?

const banner = document.getElementById("builtin-readonly-banner");

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
   * Wire the built-in read-only banner copy button. Call once at startup.
   */
  init() {
    document
      .getElementById("builtin-copy-btn")
      .addEventListener("click", () =>
        Workspace.copyBuiltinOpenFileToProject()
      );

    MonacoEditor.setText("", "plaintext", true);
  },

  /**
   * Copy the currently open built-in file into the user project at the same path.
   */
  copyBuiltinOpenFileToProject() {
    if (!isBuiltIn || currentOpenPath === null) {
      return;
    }

    let rawFile;
    try {
      rawFile = BuiltinFiles.readFile(currentOpenPath);
    } catch (error) {
      Terminal.printLine(`[Filesystem] Could not copy: ${error.message}`);
      return;
    }

    try {
      FileSystem.writeFile(currentOpenPath, rawFile);
    } catch (error) {
      Terminal.printLine(`[Filesystem] Could not copy: ${error.message}`);
      return;
    }

    Workspace.openFile(currentOpenPath);
    explorerReloadHandler();
  },

  /**
   * Save the currently open file in the editor
   */
  saveCurrentFile() {
    if (readOnly || isBuiltIn || !currentOpenPath) return;

    const text = MonacoEditor.getText();
    // Convert text to Uint8Array
    const encoded = new TextEncoder().encode(text);

    // Write file to FS
    try {
      FileSystem.writeFile(currentOpenPath, encoded);
    } catch (error) {
      Terminal.printLine(error.message);
      return;
    }

    explorerReloadHandler();
  },

  /**
   * Load and open a certain file into the editor
   * @param {string} path - The path of the file to open.
   */
  openFile(path) {
    let rawFile;

    try {
      rawFile = FileSystem.readFile(path);
      readOnly = false;
      isBuiltIn = false;
    } catch {
      rawFile = BuiltinFiles.readFile(path);
      readOnly = true;
      isBuiltIn = true;
    }

    if (!rawFile) {
      console.error("Couldn't open file " + path);
      return;
    }

    currentOpenPath = path;

    const extension = path.toLowerCase().split(".").slice(-1)[0];

    if (TEXTISH_EXTENSIONS.includes(extension)) {
      // Plain text file: simply decode the bytes into text
      const decodedString = new TextDecoder().decode(rawFile);

      // Load into monaco
      MonacoEditor.setText(decodedString, extension, readOnly);
      banner.hidden = !isBuiltIn;
    } else {
      // If we "load" binary as description into the editor we need to NOT save it upon exit!
      readOnly = true;
      // Binary file: show file size
      let size = 0;
      try {
        size = FileSystem.fileSizeAtPath(path);
        banner.hidden = true;
      } catch (e) {
        size = BuiltinFiles.fileSizeAtPath(path);
        banner.hidden = false;
      }

      MonacoEditor.setText(`Binary (${size} bytes)`, "plaintext", readOnly);
    }
  },

  /**
   * Creates a minimal main.lua and manifest.lua
   */
  async createEmptyProject() {
    if (!FileSystem.isEmpty()) return;

    const result = await Swal.fire({
      input: "text",
      inputValue: DEFAULT_PROJECT_NAME,
      title: "Project name",
      showCancelButton: true,
    });

    if (result.isDismissed) {
      return;
    }

    if (result.value.trim() === "") {
      Terminal.printLine("[Filesystem] Invalid project name.");
      return;
    }

    // Might as well enforce style now...
    const projectName = result.value
      .trim()
      .toLowerCase()
      .split(RegExp("\\s"))
      .join("-");

    // Entrypoint script
    const mainPath = `/${projectName}/main.lua`;
    const mainData = new TextEncoder().encode(luaMainTemplate);
    const cleanMainPath = FileSystem.normalizePath(mainPath);
    FileSystem.writeFile(cleanMainPath, mainData);

    // Manifest file
    const manifestPath = `/${projectName}/manifest.lua`;
    // Replace placeholder
    const manifest = luaManifestTemplate.replace("<game_name>", result.value);
    const manifestData = new TextEncoder().encode(manifest);
    const cleanManifestPath = FileSystem.normalizePath(manifestPath);
    FileSystem.writeFile(cleanManifestPath, manifestData);

    Workspace.openFile(cleanMainPath);
    explorerReloadHandler();
  },

  /**
   * Get the path of the currently open file.
   * @returns {string} The path of the currently open file.
   */
  getCurrentOpenPath() {
    return currentOpenPath;
  },

  /**
   * Check whether the currently open file is built-in or comes from the user files
   *
   * @returns {boolean} whether the currently open file is built in
   */
  isCurrentOpenPathBuiltIn() {
    return isBuiltIn;
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

    if (isBuiltIn) return;

    // Empty editor and prevent saving
    currentOpenPath = null;
    MonacoEditor.setText("", "plaintext", true);
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
