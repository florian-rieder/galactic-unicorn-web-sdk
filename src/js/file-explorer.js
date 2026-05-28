import {
  deleteFile,
  fileExists,
  listFiles,
  renameFile,
  writeFile,
} from "./file-system.js";
import {
  getCurrentOpenPath,
  onFileRemoved,
  onFileRenamed,
  openFile,
  saveCurrentFile,
} from "./workspace.js";

const fileInput = document.querySelector("#file-upload-input");
const fileExplorer = document.querySelector("#file-explorer");
const fileNewBtn = document.querySelector("#file-new-btn");
const fileUploadBtn = document.querySelector("#file-upload-btn");
const fileRenameBtn = document.querySelector("#file-rename-btn");
const fileDeleteBtn = document.querySelector("#file-delete-btn");

// Keep track of the open folder to avoid all folder collapsing when the file explorer
// is reloaded
const openFolders = new Set();

/**
 * File System Node data structure, used to represent the file hierarchy as a tree
 */
class FSNode {
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

export function initFileExplorer() {
  reloadFileExplorer();

  fileNewBtn.addEventListener("click", createNewFile);
  fileRenameBtn.addEventListener("click", renameOpenFile);
  fileDeleteBtn.addEventListener("click", deleteOpenFile);
  fileUploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", uploadFiles);
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

function uploadFiles() {
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
    const reader = new FileReader();

    // When the reader reads the file, it encodes it as a Uint8Array (basically a bytearray)
    // idk why you need to do it this way but this is how you read the file contents
    reader.onload = (event) => {
      // Get the file as a raw byte array buffer
      const arrayBuffer = event.target.result;
      // Create a Uint8Array view to be able to read the array buffer
      const view = new Uint8Array(arrayBuffer);

      writeFile("/" + file.name, view);

      pending -= 1;
      // If all files are processed, reload the file explorer
      // (only once per upload, not once per file)
      if (pending === 0) {
        reloadFileExplorer();
      }
    };

    // Convert the file contents to a byte array suitable for storage
    // (will trigger the onload event when the file is read)
    reader.readAsArrayBuffer(file);
  }
}

function createNewFile() {
  const raw = prompt("New file name:", "script.lua");
  if (raw === null) {
    return;
  }

  const path = normalizeFilePath(raw);
  if (path === null) {
    alert("Invalid file name.");
    return;
  }

  if (fileExists(path)) {
    alert("A file already exists at " + path);
    return;
  }

  saveCurrentFile();
  writeFile(path, new TextEncoder().encode(""));
  openFile(path);
  reloadFileExplorer();
}

function renameOpenFile() {
  const currentPath = getCurrentOpenPath();
  if (currentPath === null) {
    return;
  }

  const raw = prompt("Rename file:", currentPath);
  if (raw === null) {
    return;
  }

  const newPath = normalizeFilePath(raw.trim());
  if (newPath === null) {
    alert("Invalid file path.");
    return;
  }

  if (newPath === currentPath) {
    return;
  }

  if (fileExists(newPath)) {
    alert("A file already exists at " + newPath);
    return;
  }

  saveCurrentFile();
  if (!renameFile(currentPath, newPath)) {
    alert("Could not rename " + currentPath);
    return;
  }

  onFileRenamed(currentPath, newPath);
  reloadFileExplorer();
}

function deleteOpenFile() {
  const currentPath = getCurrentOpenPath();
  if (currentPath === null) {
    return;
  }

  if (!confirm("Delete " + currentPath + "?")) {
    return;
  }

  // Actually delete the file from the filesystem
  deleteFile(currentPath);
  // Notify the workspace that the file has been removed and reload the file explorer
  onFileRemoved(currentPath);
  reloadFileExplorer();
}

function buildTree() {
  // Build the file hierarchy from the flat file storage
  const fileList = listFiles();

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

function treeIcon(kind) {
  const icon = document.createElement("span");
  icon.className = `tree-icon tree-icon--${kind}`;
  return icon;
}

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
    if (node.path == getCurrentOpenPath()) {
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
    isAncestorFolder(node.path, getCurrentOpenPath())
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

export function reloadFileExplorer() {
  fileExplorer.innerHTML = "";
  // Build a tree datastructure from the flat stored files paths
  const root = buildTree();

  // Render the tree as DOM elements recursively
  const tree = renderNode(root);
  if (tree) {
    fileExplorer.appendChild(tree);
  }
}

function onFileClick(path) {
  saveCurrentFile();
  openFile(path);
  reloadFileExplorer();
}

function isAncestorFolder(folderPath, filePath) {
  return (
    filePath != null &&
    filePath.startsWith(folderPath) &&
    filePath !== folderPath
  );
}
