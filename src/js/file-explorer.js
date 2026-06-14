import { saveAs } from "file-saver";
import Swal from "sweetalert2";

import { FileSystem } from "./fs/file-system.js";
import { BuiltinFiles } from "./fs/builtin-files.js";
import { FileTree } from "./fs/file-tree.js";
import { unzip, zip } from "./fs/zip.js";
import { Workspace } from "./workspace.js";
import { Terminal } from "./terminal.js";

// File name when the user downloads the project as a zip file
const PROJECT_EXPORT_ZIP_FILE_NAME = "project-export.zip";
const DEFAULT_FILE_NAME = "script.lua";

// Keep track of the open folder to avoid all folder collapsing when the file explorer
// is reloaded
const openFolders = new Set();

const fileInput = document.querySelector("#file-upload-input");
const fileExplorer = document.querySelector("#file-explorer");
const builtinFileExplorer = document.querySelector("#builtin-file-explorer");
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

let commonFileTree;

/**
 * File explorer component, used to display the file system as a tree
 */
export const FileExplorer = Object.freeze({
  tree() {
    return commonFileTree;
  },

  /**
   * Reload the file explorer
   */
  reload() {
    fileExplorer.innerHTML = "";

    // Enable/disable toolbar buttons
    const openPath = Workspace.getCurrentOpenPath();
    const isBuiltIn = Workspace.isCurrentOpenPathBuiltIn();
    fileRenameBtn.disabled = isBuiltIn || !openPath;
    fileDeleteBtn.disabled = isBuiltIn || !openPath;
    exportBtn.disabled = FileSystem.isEmpty();

    // Generate file explorer panels
    const userFilePaths = FileSystem.listAllFiles();
    const builtinFilePaths = BuiltinFiles.listAllFiles();

    if (FileSystem.isEmpty()) {
      // First time setup
      // Display a "setup empty project" button in the user file explorer panel
      const bootstrapBtn = document.createElement("button");
      bootstrapBtn.innerHTML = "Setup empty project";
      bootstrapBtn.classList.add("file-explorer-start-btn");
      bootstrapBtn.addEventListener("click", Workspace.createEmptyProject);

      fileExplorer.appendChild(bootstrapBtn);
    } else {
      // Otherwise, build the user files tree
      // Build a tree datastructure from the flat stored files paths
      const userFileTree = new FileTree(
        userFilePaths,
        FileSystem.PATH_SEPARATOR
      );
      // Render the tree as DOM elements recursively
      const userDomTree = renderNode(userFileTree.root);
      if (userDomTree) {
        fileExplorer.appendChild(userDomTree);
      }
    }

    // Build the built-in files tree, separate from the user files tree
    builtinFileExplorer.innerHTML = "";
    const builtinFileTree = new FileTree(
      builtinFilePaths,
      FileSystem.PATH_SEPARATOR
    );
    // Render the tree as DOM elements recursively
    const builtinDomTree = renderNode(builtinFileTree.root);
    if (builtinDomTree) {
      builtinFileExplorer.appendChild(builtinDomTree);
    }

    // Create a common file tree that can be used to list directories of the combined file system
    const commonFiles = [...new Set([...userFilePaths, ...builtinFilePaths])]
    commonFileTree = new FileTree(commonFiles, FileSystem.PATH_SEPARATOR);
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
          } else {
            try {
              const path = FileSystem.normalizePath(file.name);
              if (path === null) {
                Terminal.printLine(
                  "[Filesystem] Invalid file name: " + file.name
                );
                return;
              }
              FileSystem.writeFile(path, view);
            } catch (error) {
              Terminal.printLine(
                `[Filesystem] Failed to upload file: ${error.message}`
              );
            }
          }

          onFileDone();
        })
        .catch((error) => {
          Terminal.printLine(
            `[Filesystem] Failed to upload file ${file.name}: ${error}`
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

    try {
      FileSystem.writeFile(path, new TextEncoder().encode(""));
    } catch (error) {
      Terminal.printLine(
        `[Filesystem] Failed to create file: ${error.message}`
      );
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
    if (Workspace.isCurrentOpenPathBuiltIn()) return;

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

    try {
      FileSystem.renameFile(currentPath, newPath);
    } catch (error) {
      Terminal.printLine(`[Filesystem] Could not rename: ${error.message}`);
      return;
    }

    Workspace.onFileRenamed(currentPath, newPath);
    this.reload();
  },

  /**
   * Delete the currently open file
   */
  async deleteOpenFile() {
    if (Workspace.isCurrentOpenPathBuiltIn()) return;

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

    const allFiles = FileSystem.getAllFiles();
    if (Object.entries(allFiles).length == 0) return;

    // Zip the tree using fflate
    const zipped = zip(allFiles);

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
 * @param {Uint8Array} bytes
 */
function importZipBytes(bytes, zipFileName) {
  const filesToWrite = unzip(bytes);

  if (Object.keys(filesToWrite).length === 0) {
    Terminal.printLine(
      `[Filesystem] ${zipFileName} contains no importable files.`
    );
    return;
  }

  const failed = [];
  for (const [path, data] of Object.entries(filesToWrite)) {
    try {
      FileSystem.writeFile(path, data);
    } catch (error) {
      Terminal.printLine(`[Filesystem] Failed to import: ${error.message}`);
      failed.push(path);
    }
  }

  if (failed.length > 0) {
    Terminal.printLine(
      `[Filesystem] Failed to import files: ${failed.join(", ")}`
    );
  }
}
