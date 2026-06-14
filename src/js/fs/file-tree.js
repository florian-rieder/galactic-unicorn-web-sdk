/**
 * File system tree datastructure builder.
 * Converts a flat array of paths into an actual tree datastructure suitable for
 * further processing that needs to be tree-aware (i.e. file explorer UI)
 */

import { FSNode } from "./fs-node.js";
import { FileSystem } from "./file-system.js";

export class FileTree {
  /**
   * Build FSNode tree from a flat array of file paths
   *
   * @param {[string]} flatFilepathsList flat array of file paths to build a tree from
   * @param {string} pathSeparator defaults to "/"
   */
  constructor(flatFilepathsList, pathSeparator = "/") {
    this.pathSeparator = pathSeparator;
    this.root = new FSNode("root", this.pathSeparator);

    for (const path of flatFilepathsList) {
      let parts = path.split(this.pathSeparator);

      let currentLevel = this.root;
      let currentPath = this.root.path;

      // Parts 0 is always empty (paths start with a '/')
      parts.shift(); // Remove part 0

      parts.forEach((part, index) => {
        let isFile = false;

        // If this is the last part, then it's a file
        if (index == parts.length - 1) isFile = true;

        const trailingSeparator = isFile ? "" : this.pathSeparator;
        currentPath += part + trailingSeparator;

        if (!currentLevel.getChildByName(part)) {
          let newNode = new FSNode(part, currentPath, isFile);
          currentLevel.addChild(newNode);
          currentLevel = newNode;
        } else {
          currentLevel = currentLevel.getChildByName(part);
        }
      });
    }
  }

  /**
   * List all files and directories in a directory (therefore needs to return FSNodes, because
   * directories don't really exist as path keys in localStorage)
   *
   * @param {FSNode} root
   * @returns {FSNode[]} list of file system nodes
   */
  listDirectory(path) {
    const normalizedPath = FileSystem.normalizePath(path);

    if (!normalizedPath) {
      throw new Error(`Invalid path: ${path}`);
    }

    // Special case if the given path is the root, we don't even need to walk the FS, just return
    // the children of the root node
    if (normalizedPath === this.pathSeparator) {
      return this.root.getSortedChildren();
    }

    // Walk up the tree to the node that represents the directory at path
    const parts = normalizedPath.split(this.pathSeparator);
    parts.shift(); // parts[0] is always an empty string

    let current = this.root;
    for (const part of parts) {
      // Find out which child is this path part
      let next;
      for (const child of current.getSortedChildren()) {
        if (child.name === part) {
          next = child;
          break;
        }
      }

      // Walk up to the child node that is this path part
      if (next) {
        current = next;
      } else {
        // If we didn't find one, the directory doesn't exist
        throw new Error(`Not found: ${part} (${path})`);
      }
    }

    // If the node at the given path is a file, error out because this isn't for files.
    if (current.isFile) {
      throw new Error(`Not a directory: ${path}`);
    }

    return current.getSortedChildren();
  }
}
