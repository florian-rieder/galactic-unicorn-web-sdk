/**
 * File System Node data structure, used to represent a file hierarchy as a tree
 */
export class FSNode {
  /**
   * Create a new file system node
   *
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
   *
   * @param {FSNode} child
   */
  addChild(child) {
    this.children.set(child.name, child);
  }

  /**
   * Get a child node of this node by its name
   *
   * @param {String} childName
   * @returns {FSNode|null}
   */
  getChildByName(childName) {
    return this.children.get(childName);
  }

  /**
   * Return a sorted array of the child nodes of this node, sorted by type and name alphabetical
   *
   * @param {FSNode} node
   * @returns {FSNode[]}
   */
  getSortedChildren() {
    return Array.from(this.children.values()).sort((a, b) => {
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
}
