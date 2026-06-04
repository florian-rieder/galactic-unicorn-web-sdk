import { zipSync, unzipSync } from "fflate";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";

import { FileSystem } from "./file-system.js";
import { FileTree } from "./file-tree.js";
import { Workspace } from "./workspace.js";
import { Terminal } from "./terminal.js";

// File name when the user downloads the project as a zip file
const PROJECT_EXPORT_ZIP_FILE_NAME = "project.zip";
const DEFAULT_FILE_NAME = "script.lua";

// Keep track of the open folder to avoid all folder collapsing when the file explorer
// is reloaded
const openFolders = new Set();

const fileInput = document.querySelector("#file-upload-input");
const fileExplorer = document.querySelector("#file-explorer");
const fileNewBtn = document.querySelector("#file-new-btn");
const fileUploadBtn = document.querySelector("#file-upload-btn");
const fileRenameBtn = document.querySelector("#file-rename-btn");
const fileDeleteBtn = document.querySelector("#file-delete-btn");
const exportBtn = document.querySelector("#export-btn");

fileInput.addEventListener("change", () => FileExplorer.uploadFiles());
fileNewBtn.addEventListener("click", () => FileExplorer.createNewFile());
fileRenameBtn.addEventListener("click", () => FileExplorer.renameOpenFile());
fileDeleteBtn.addEventListener("click", () => FileExplorer.deleteOpenFile());
fileUploadBtn.addEventListener("click", () => fileInput.click());
exportBtn.addEventListener("click", () => FileExplorer.exportZip());

/**
 * File explorer component, used to display the file system as a tree
 */
export const FileExplorer = Object.freeze({
  /**
   * Reload the file explorer
   */
  reload() {
    fileExplorer.innerHTML = "";
    // Build a tree datastructure from the flat stored files paths
    const filePaths = FileSystem.listAllFiles();
    const root = FileTree.build(filePaths, FileSystem.PATH_SEPARATOR);

    // Render the tree as DOM elements recursively
    const domTree = renderNode(root);
    if (domTree) {
      fileExplorer.appendChild(domTree);
    }
  },

  /**
   * Upload files to the file system
   */
  uploadFiles() {
    const files = [...fileInput.files];
    // Clear the input so the user can upload the same file again
    fileInput.value = "";

    // If no files are selected, do nothing
    if (files.length === 0) {
      return;
    }

    Workspace.saveCurrentFile();

    // Keep track of the number of files that are still being processed
    let pending = files.length;
    const onFileDone = () => {
      // If all files are processed, reload the file explorer
      // (only once per upload, not once per file)
      pending -= 1;
      if (pending === 0) {
        this.reload();
      }
    };

    for (const file of files) {
      file
        .arrayBuffer()
        .then((arrayBuffer) => {
          // Create a Uint8Array view to be able to read the array buffer
          const view = new Uint8Array(arrayBuffer);

          if (file.name.toLowerCase().endsWith(".zip")) {
            importZipBytes(view, file.name);
          } else if (!FileSystem.writeFile("/" + file.name, view)) {
            Terminal.printLine(
              `[Filesystem] Failed to upload file ${file.name}`,
            );
          }

          onFileDone();
        })
        .catch((error) => {
          Terminal.printLine(
            `[Filesystem] Failed to upload file ${file.name}: ${error}`,
          );
          onFileDone();
        });
    }
  },

  /**
   * Create a new file
   */
  async createNewFile() {
    const result = await Swal.fire({
      input: "text",
      inputValue: DEFAULT_FILE_NAME,
      title: "New file name",
      showCancelButton: true,
    });

    if (result.isDismissed) {
      return;
    }

    const value = result.value.trim();

    if (!value) {
      Terminal.printLine("[Filesystem] Invalid file name.");
      return;
    }

    const path = FileSystem.normalizePath(value);
    if (path === null) {
      Terminal.printLine("[Filesystem] Invalid file name.");
      return;
    }

    if (FileSystem.fileExists(path)) {
      Terminal.printLine("[Filesystem] A file already exists at " + path);
      return;
    }

    Workspace.saveCurrentFile();

    if (!FileSystem.writeFile(path, new TextEncoder().encode(""))) {
      Terminal.printLine(`[Filesystem] Failed to create file ${path}`);
      return;
    }

    // Open the new file
    Workspace.openFile(path);
    // Reload the file explorer to show the new file
    this.reload();
  },

  /**
   * Rename the currently open file
   */
  async renameOpenFile() {
    const currentPath = Workspace.getCurrentOpenPath();
    if (currentPath === null) {
      return;
    }

    const result = await Swal.fire({
      input: "text",
      inputValue: currentPath,
      title: "Rename file",
      showCancelButton: true,
    });

    if (result.isDismissed) {
      return;
    }

    const value = result.value.trim();

    if (!value) {
      Terminal.printLine("[Filesystem] Invalid file name.");
      return;
    }

    const newPath = FileSystem.normalizePath(value);
    if (newPath === null) {
      Terminal.printLine("[Filesystem] Invalid file path.");
      return;
    }

    if (newPath === currentPath) {
      return;
    }

    if (FileSystem.fileExists(newPath)) {
      Terminal.printLine("[Filesystem] A file already exists at " + newPath);
      return;
    }

    Workspace.saveCurrentFile();
    if (!FileSystem.renameFile(currentPath, newPath)) {
      Terminal.printLine("[Filesystem] Could not rename " + currentPath);
      return;
    }

    Workspace.onFileRenamed(currentPath, newPath);
    this.reload();
  },

  /**
   * Delete the currently open file
   */
  async deleteOpenFile() {
    const currentPath = Workspace.getCurrentOpenPath();
    if (currentPath === null) {
      return;
    }

    const result = await Swal.fire({
      title: "Delete " + currentPath + "?",
      showCancelButton: true,
      confirmButtonText: "Delete",
      icon: "warning",
      customClass: {
        popup: "swal2-popup--danger",
      },
    });

    if (result.isConfirmed) {
      // Actually delete the file from the filesystem
      FileSystem.deleteFile(currentPath);
      // Notify the workspace that the file has been removed and reload the file explorer
      Workspace.onFileRemoved(currentPath);
      this.reload();
    }
  },

  exportZip() {
    // Save the current file before exporting
    Workspace.saveCurrentFile();

    // fflate expects raw Uint8Array as file data, which is perfect since it's
    // exactly what our FileSystem outputs ! Bingo !
    const allFiles = FileSystem.getAllFiles();

    // Zip the tree using fflate
    const zipped = zipSync(allFiles, {
      // These options are the defaults for all files, but file-specific
      // options take precedence.
      level: 1,
      // Set last modified time to now
      mtime: new Date(),
    });

    // fflate produces a Uint8Array representing the zipped file
    // We need to convert it to a blob in order to make it downloadable using
    // file-saver
    const blob = new Blob([zipped]);

    // Save the zip file to user's computer using file-saver
    saveAs(blob, PROJECT_EXPORT_ZIP_FILE_NAME);
  },
});

/**
 * Create a tree icon element for a given kind of node
 * @param {string} kind
 * @returns {HTMLElement}
 */
function treeIcon(kind) {
  const icon = document.createElement("span");
  icon.className = `tree-icon tree-icon--${kind}`;
  return icon;
}

/**
 * Render a node of the file tree
 * @param {FSNode} node
 * @returns {HTMLElement}
 */
function renderNode(node) {
  if (node.name === "root") {
    if (node.children.size === 0) {
      return null;
    }

    const ul = document.createElement("ul");
    ul.className = "file-tree";
    for (const child of node.getSortedChildren()) {
      ul.appendChild(renderNode(child));
    }
    return ul;
  }

  const li = document.createElement("li");

  if (node.isFile) {
    const row = document.createElement("button");
    row.type = "button";
    row.dataset.path = node.path;
    row.append(treeIcon("file"), document.createTextNode(node.name));
    row.addEventListener("click", () => onFileClick(node.path));
    if (node.path == Workspace.getCurrentOpenPath()) {
      row.classList.add("current-open-file");
    }
    li.appendChild(row);
    return li;
  }

  const details = document.createElement("details");
  details.addEventListener("toggle", () => {
    if (details.open) {
      openFolders.add(node.path);
    } else {
      openFolders.delete(node.path);
    }
  });

  if (
    openFolders.has(node.path) ||
    isAncestorFolder(node.path, Workspace.getCurrentOpenPath())
  ) {
    details.open = true;
  }

  const summary = document.createElement("summary");
  summary.append(treeIcon("folder"), document.createTextNode(node.name));

  details.appendChild(summary);

  if (node.children.size > 0) {
    const ul = document.createElement("ul");

    for (const child of node.getSortedChildren()) {
      ul.appendChild(renderNode(child));
    }
    details.appendChild(ul);
  }

  li.appendChild(details);
  return li;
}

/**
 * Handle the event of a file in the tree being clicked
 * @param {string} path
 */
function onFileClick(path) {
  Workspace.saveCurrentFile();
  Workspace.openFile(path);
  FileExplorer.reload();
}

/**
 * Check if a folder is an ancestor of a file
 * @param {string} folderPath
 * @param {string} filePath
 * @returns {boolean}
 */
function isAncestorFolder(folderPath, filePath) {
  return (
    filePath != null &&
    filePath.startsWith(folderPath) &&
    filePath !== folderPath
  );
}

/**
 * Strip one leading path segment when every entry lives under the same folder
 * (e.g. Finder "Compress project/" -> project/main.lua -> /main.lua).
 *
 * @param {string[]} paths Normalized virtual paths.
 * @returns {string[]} Paths with the shared root removed, or unchanged.
 */
function stripSingleZipRootPrefix(paths) {
  if (paths.length === 0) {
    return paths;
  }

  const partsList = paths.map((path) =>
    path.split(FileSystem.PATH_SEPARATOR).filter((part) => part.length > 0),
  );

  const root = partsList[0][0];
  if (!root) {
    return paths;
  }

  const canStrip = partsList.every(
    (parts) => parts.length >= 2 && parts[0] === root,
  );
  if (!canStrip) {
    return paths;
  }

  return partsList.map(
    (parts) =>
      FileSystem.PATH_SEPARATOR +
      parts.slice(1).join(FileSystem.PATH_SEPARATOR),
  );
}

/**
 * @param {Record<string, Uint8Array>} filesToWrite
 * @returns {Record<string, Uint8Array>}
 */
function applyStrippedZipRoot(filesToWrite) {
  const paths = Object.keys(filesToWrite);
  const strippedPaths = stripSingleZipRootPrefix(paths);
  if (paths.every((path, index) => path === strippedPaths[index])) {
    return filesToWrite;
  }

  const remapped = {};
  for (let i = 0; i < paths.length; i++) {
    remapped[strippedPaths[i]] = filesToWrite[paths[i]];
  }
  return remapped;
}

/**
 * @param {Uint8Array} bytes
 * @param {string} zipFileName
 */
function importZipBytes(bytes, zipFileName) {
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    Terminal.printLine(
      `[Filesystem] Failed to read ZIP ${zipFileName}: ${error instanceof Error ? error.message : error}`,
    );
    return;
  }

  const filesToImport = {};
  for (const [entryName, data] of Object.entries(entries)) {
    const name = entryName.replace(/\\/g, FileSystem.PATH_SEPARATOR).trim();
    if (!name || name.endsWith(FileSystem.PATH_SEPARATOR)) {
      continue;
    }
    // Ignore macOS zip junk
    if (name.includes("__MACOSX") || name.includes(".DS_Store")) {
      continue;
    }
    const path = FileSystem.normalizePath(name);
    if (path === null) {
      continue;
    }

    filesToImport[path] = data;
  }

  if (Object.keys(filesToImport).length === 0) {
    Terminal.printLine(
      `[Filesystem] ${zipFileName} contains no importable files.`,
    );
    return;
  }

  const filesToWrite = applyStrippedZipRoot(filesToImport);

  const failed = [];
  for (const [path, data] of Object.entries(filesToWrite)) {
    if (!FileSystem.writeFile(path, data)) {
      failed.push(path);
    }
  }

  if (failed.length > 0) {
    Terminal.printLine(`[Filesystem] Failed to import: ${failed.join(", ")}`);
  }
}
