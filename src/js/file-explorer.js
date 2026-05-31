import { zipSync } from "fflate";
import { saveAs } from "file-saver";

import { FileSystem } from "./file-system.js";
import { Workspace } from "./workspace.js";
import { Terminal } from "./terminal.js";

// File name when the user downloads the project as a zip file
const PROJECT_EXPORT_ZIP_FILE_NAME = "project.zip";

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
    const root = buildTree();

    // Render the tree as DOM elements recursively
    const tree = renderNode(root);
    if (tree) {
      fileExplorer.appendChild(tree);
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

    // Keep track of the number of files that are still being processed
    let pending = files.length;
    for (const file of files) {
      file
        .arrayBuffer()
        .then((arrayBuffer) => {
          // Create a Uint8Array view to be able to read the array buffer
          const view = new Uint8Array(arrayBuffer);

          if (!FileSystem.writeFile("/" + file.name, view)) {
            Terminal.printLine(
              `[Filesystem] Failed to upload file ${file.name}`,
            );
          }

          pending -= 1;

          // If all files are processed, reload the file explorer
          // (only once per upload, not once per file)
          if (pending === 0) {
            this.reload();
          }
        })
        .catch((error) => {
          Terminal.printLine(
            `[Filesystem] Failed to upload file ${file.name}: ${error}`,
          );
        });
    }
  },

  /**
   * Create a new file
   */
  createNewFile() {
    const raw = prompt("New file name:", "script.lua");
    if (raw === null) {
      return;
    }

    const path = normalizeFilePath(raw);
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
  renameOpenFile() {
    const currentPath = Workspace.getCurrentOpenPath();
    if (currentPath === null) {
      return;
    }

    const raw = prompt("Rename file:", currentPath);
    if (raw === null) {
      return;
    }

    const newPath = normalizeFilePath(raw.trim());
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
  deleteOpenFile() {
    const currentPath = Workspace.getCurrentOpenPath();
    if (currentPath === null) {
      return;
    }

    if (!confirm("Delete " + currentPath + "?")) {
      return;
    }

    // Actually delete the file from the filesystem
    FileSystem.deleteFile(currentPath);
    // Notify the workspace that the file has been removed and reload the file explorer
    Workspace.onFileRemoved(currentPath);
    this.reload();
  },

  exportZip() {
    // Save the current file before exporting
    Workspace.saveCurrentFile();

    const files = FileSystem.listFiles();
    // Get files data and create the shape that fflate expects data to be in
    // order to make a zip.
    const objectFileTree = {};
    for (const filePath of files) {
      // fflate expects raw Uint8Array as file data, which is perfect since it's
      // exactly what our FileSystem outputs ! Bingo !
      const rawFileData = FileSystem.readFile(filePath);
      if (rawFileData === null) {
        Terminal.printLine(`[Filesystem] Failed to read file ${filePath}`);
        continue;
      }
      // fflate accepts that we just give it full paths as filename so it's easy !
      objectFileTree[filePath] = rawFileData;
    }

    // Zip the tree using fflate
    const zipped = zipSync(objectFileTree, {
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
 * File System Node data structure, used to represent the file hierarchy as a tree
 */
class FSNode {
  /**
   * Create a new file system node
   * @param {string} name
   * @param {string} path
   * @param {boolean} isFile
   */
  constructor(name, path, isFile = false) {
    this.name = name;
    this.path = path;
    this.isFile = isFile;
    this.children = new Map();
  }

  /**
   * Add a child node to this node
   * @param {FSNode} child
   */
  addChild(child) {
    this.children.set(child.name, child);
  }

  /**
   * Get a child node of this node by its name
   * @param {String} childName
   * @returns {FSNode|null}
   */
  getChildByName(childName) {
    return this.children.get(childName);
  }
}

/**
 * Build the file tree from the flat file storage
 * @returns {FSNode}
 */
function buildTree() {
  // Build the file hierarchy from the flat file storage
  const fileList = FileSystem.listFiles();

  let root = new FSNode("root", "/");

  for (const path of fileList) {
    let parts = path.split("/");

    let currentLevel = root;
    let currentPath = root.path;

    // Parts 0 is always empty (paths start with a '/')
    parts.shift(); // Remove part 0

    parts.forEach((part, index) => {
      let isFile = false;

      // If this is the last part, then it's a file
      if (index == parts.length - 1) isFile = true;

      const trailingSlash = isFile ? "" : "/";
      currentPath += part + trailingSlash;

      if (!currentLevel.getChildByName(part)) {
        let newNode = new FSNode(part, currentPath, isFile);
        currentLevel.addChild(newNode);
        currentLevel = newNode;
      } else {
        currentLevel = currentLevel.getChildByName(part);
      }
    });
  }

  return root;
}

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
    for (const child of sortedChildren(node)) {
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

    for (const child of sortedChildren(node)) {
      ul.appendChild(renderNode(child));
    }
    details.appendChild(ul);
  }

  li.appendChild(details);
  return li;
}

/**
 * Sort the children of a node by type and name alphabetically
 * @param {FSNode} node
 * @returns {FSNode[]}
 */
function sortedChildren(node) {
  return Array.from(node.children.values()).sort((a, b) => {
    // a is file and b is directory => a > b
    if (a.isFile && !b.isFile) {
      return 1;
      // a is directory and b is file => a < b
    } else if (!a.isFile && b.isFile) {
      return -1;
    }

    // Fallback on alphabetical sorting if the type of the two files is the same
    return a.name.localeCompare(b.name);
  });
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
 * Normalize user input into a virtual path like /foo.lua
 * @param {string} input
 * @returns {string|null}
 */
function normalizeFilePath(input) {
  // Like any proper input handling, we start by trimming the input
  let name = input.trim();
  if (!name) {
    return null;
  }

  // Add a leading slash if it's not there
  if (!name.startsWith("/")) {
    name = "/" + name;
  }

  // Remove double slashes
  const parts = name.split("/").filter((part) => part.length > 0);

  // Reject empty paths or paths that contain "." or ".." (prevent path traversal, in
  // spirit at least since we use a virtual filesystem)
  if (
    parts.length === 0 ||
    parts.some((part) => part === "." || part === "..")
  ) {
    return null;
  }

  // Return the normalized path (with a leading slash)
  return "/" + parts.join("/");
}
