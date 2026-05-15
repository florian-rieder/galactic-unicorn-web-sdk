import { listFiles } from "./file-system.js";

const fileExplorer = document.querySelector("#file-explorer");

/**
 * File System Node data structure, used to represent the file hierarchy as a tree
 */
class FSNode {
  constructor(name, path, isFile=false) {
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
    return this.children.get(childName)
  }
}

export function initFileExplorer() {
  fileExplorer.replaceChildren();

  // Build a tree datastructure from the flat stored files paths
  const root = buildTree();

  // Render the tree as DOM elements recursively
  const tree = renderNode(root);
  if (tree) {
    fileExplorer.appendChild(tree);
  }
}

function buildTree() {
  // Build the file hierarchy from the flat file storage
  const fileList = listFiles();

  let root = new FSNode("root", "/")

  for (const path of fileList) {
    let parts = path.split("/")

    let currentLevel = root;
    let currentPath = root.path;

    // Parts 0 is always empty (paths start with a '/')
    parts.shift() // Remove part 0

    parts.forEach((part, index) => {
      let isFile = false

      // If this is the last part, then it's a file
      if (index == parts.length - 1) isFile = true;

      const trailingSlash = isFile ? '' : '/'
      currentPath += part + trailingSlash

      if (!currentLevel.getChildByName(part)) {
        let newNode = new FSNode(part, currentPath, isFile);
        currentLevel.addChild(newNode);
        currentLevel = newNode;
      } else {
        currentLevel = currentLevel.getChildByName(part);
      }
    });
  }

  return root
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
    for (const child of node.children.values()) {
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
    li.appendChild(row);
    return li;
  }

  const details = document.createElement("details");
  details.open = true;

  const summary = document.createElement("summary");
  summary.append(treeIcon("folder"), document.createTextNode(node.name));
  details.appendChild(summary);

  if (node.children.size > 0) {
    const ul = document.createElement("ul");
    for (const child of node.children.values()) {
      ul.appendChild(renderNode(child));
    }
    details.appendChild(ul);
  }

  li.appendChild(details);
  return li;
}
