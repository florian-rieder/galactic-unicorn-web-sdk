/**
 * Filesystem emulation using localStorage
 * We can use the path as localStorage key, and write base64 encoded data
 *
 * Design decision: files are Uint8Array (raw bytes) no matter what the file is.
 * Caller can then decode the bytes into whatever they want to, and have to encode it
 * to a Uint8Array to write it back to the file system.
 */

import { FileTree } from "./file-tree.js";

const PATH_SEPARATOR = "/";

/**
 * File System interface
 */
export const FileSystem = Object.freeze({
  PATH_SEPARATOR: PATH_SEPARATOR,

  /**
   * Writes raw bytes to file storage at the given path
   * @param {String} path
   * @param {Uint8Array} data - raw bytes
   * @returns {boolean} whether the write succeeded
   */
  writeFile(path, data) {
    // Encode raw bytes to base64 for storage
    localStorage.setItem(path, data.toBase64());
  },

  /**
   * Read a file at the given path from the emulated file system
   *
   * For example, to decode into a string:
   * ```js
   * const decodedString = new TextDecoder().decode(raw_bytes);
   * ```
   *
   * @param {String} path
   * @returns {Uint8Array} raw bytes read from the file at path or null if it failed to read a file
   */
  readFile(path) {
    let encoded = localStorage.getItem(path);

    if (encoded === null) {
      throw new Error("Failed to open file " + path);
    }

    // Return the raw bytes to the caller
    return Uint8Array.fromBase64(encoded);
  },

  /**
   * Read a specific chunk of a file in the virtual file system
   * @param {String} path path of the file in the virtual file system
   * @param {int} offset start position of the chunk in bytes
   * @param {int} size size of the chunk in bytes
   * @returns {Uint8Array|null} raw byte array representing the chunk of data from the file
   */
  readFileChunk(path, offset, size) {
    // Inefficient emulation of chunked reading. We can't really read only a chunk
    // of a value from localStorage
    const file = this.readFile(path);
    return file.subarray(offset, offset + size);
  },

  /**
   * Get the size of a file in the virtual file system
   *
   * @param {String} path
   * @returns {int} size of the file in bytes
   */
  fileSizeAtPath(path) {
    // This is inefficient. We could probably store the file size in the
    // localStorage item as metadata in some way instead.
    let file = this.readFile(path);
    let size = 0;
    if (file !== null) {
      size = file.length;
    }
    return size;
  },

  /**
   * Check if a file exists in the virtual file system
   *
   * @param {String} path
   * @returns {bool} whether the file exists
   */
  fileExists(path) {
    return localStorage.getItem(path) !== null;
  },

  /**
   * Remove a file from the virtual file system
   * @param {String} path
   */
  deleteFile(path) {
    localStorage.removeItem(path);
  },

  /**
   * Move file data to a new path in the virtual file system
   *
   * @param {String} oldPath
   * @param {String} newPath
   * @returns {boolean} whether the rename succeeded
   */
  renameFile(oldPath, newPath) {
    if (oldPath === newPath) {
      return true;
    }
    if (!this.fileExists(oldPath) || this.fileExists(newPath)) {
      return false;
    }

    const data = this.readFile(oldPath);
    if (data === null || data === undefined) {
      return false;
    }

    // We delete the old file first so we don't risk a quota exceeded error just to rename it.
    this.deleteFile(oldPath);

    if (!this.writeFile(newPath, data)) {
      // This should never happen since we just freed the exact size of the file.
      // Hopefully it doesn't.
      // If it does, we'll try to best-effort restore the file.
      if (!this.writeFile(oldPath, data)) {
        // Welp... Oops. We're out of luck. This should never ever happen.
        const errorMessage =
          `[Filesystem] Failed to restore file ${oldPath} after rename failure.\n` +
          `The data has been lost. Sorry about that!`;
        throw new Error(errorMessage);
      }
      return false;
    }

    return true;
  },

  /**
   * List all files in the file system
   *
   * @returns {string[]} list of file paths
   */
  listAllFiles() {
    // Prevent listing localStorage methods as file paths
    let filesList = [];
    for (let key in localStorage) {
      if (key.startsWith(PATH_SEPARATOR)) {
        filesList.push(key);
      }
    }

    return filesList;
  },

  /**
   * List all files and directories in a directory (therefore needs to return FSNodes, because
   * directories don't really exist as path keys in localStorage)
   * @param {string} path
   * @returns {FSNode[]} list of file system nodes
   */
  listDirectory(path = PATH_SEPARATOR) {
    // This needs to be tree aware. We need an FSNode tree.
    const files = this.listAllFiles();
    const root = FileTree.build(files);

    const normalizedPath = this.normalizePath(path);

    if (!normalizedPath) {
      throw new Error(`Invalid path: ${path}`);
    }

    // Special case if the given path is the root, we don't even need to walk the FS, just return
    // the children of the root node
    if (normalizedPath === PATH_SEPARATOR) {
      return root.getSortedChildren();
    }

    // Walk up the tree to the node that represents the directory at path
    const parts = normalizedPath.split(PATH_SEPARATOR);
    parts.shift(); // parts[0] is always an empty string

    let current = root;
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
  },

  /**
   * Read all files from the file system
   *
   * @returns {Record<string, Uint8Array>} files
   */
  getAllFiles() {
    const files = this.listAllFiles();
    const allFiles = {};
    for (const filePath of files) {
      const rawFileData = this.readFile(filePath);
      allFiles[filePath] = rawFileData;
    }
    return allFiles;
  },

  /**
   * Normalize user input into a virtual path like `/foo.lua`
   *
   * @param {string} input
   * @returns {string|null}
   */
  normalizePath(input) {
    // Like any proper input handling, we start by trimming the input
    let name = input.trim();
    if (!name) {
      return null;
    }

    // Root path should be unchanged
    if (name == PATH_SEPARATOR) {
      return name;
    }

    // Add a leading slash if it's not there
    if (!name.startsWith(PATH_SEPARATOR)) {
      name = PATH_SEPARATOR + name;
    }

    // Remove double slashes
    const parts = name.split(PATH_SEPARATOR).filter((part) => part.length > 0);

    // Reject empty paths or paths that contain "." or ".." (prevent path traversal, in
    // spirit at least since we use a virtual filesystem)
    if (
      parts.length === 0 ||
      parts.some((part) => part === "." || part === "..")
    ) {
      return null;
    }

    // Return the normalized path (with a leading slash)
    return PATH_SEPARATOR + parts.join(PATH_SEPARATOR);
  },
});
