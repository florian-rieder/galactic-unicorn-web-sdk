/**
 * Filesystem emulation using localStorage
 * We can use the path as localStorage key, and write base64 encoded data
 *
 * Design decision: files are Uint8Array (raw bytes) no matter what the file is.
 * Caller can then decode the bytes into whatever they want to, and have to encode it
 * to a Uint8Array to write it back to the file system.
 */

const PATH_SEPARATOR = "/";

const cache = {};

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

    // Update cache
    cache[path] = data;
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
    if (cache[path]) return cache[path];

    let encoded = localStorage.getItem(path);

    if (encoded === null) {
      throw new Error("Failed to open file " + path);
    }

    const data = Uint8Array.fromBase64(encoded);

    cache[path] = data;

    // Return the raw bytes to the caller
    return data;
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

    // Invalidate cache
    cache[path] = undefined;
  },

  /**
   * Move file data to a new path in the virtual file system
   *
   * @param {String} oldPath
   * @param {String} newPath
   */
  renameFile(oldPath, newPath) {
    if (oldPath === newPath) return;

    if (!this.fileExists(oldPath) || this.fileExists(newPath)) {
      throw new Error("Failed to rename file " + oldPath + " to " + newPath);
    }

    const data = this.readFile(oldPath);

    // We delete the old file first so we don't risk a quota exceeded error just to rename it.
    this.deleteFile(oldPath);

    try {
      this.writeFile(newPath, data);
    } catch {
      // This should never happen since we just freed the exact size of the file.
      // Hopefully it doesn't.
      // If it does, we'll try to best-effort restore the file.
      try {
        this.writeFile(oldPath, data);
      } catch {
        // Welp... Oops. We're out of luck. This should never ever happen.
        const errorMessage =
          `[Filesystem] Failed to restore file ${oldPath} after rename failure.\n` +
          `The data has been lost. Sorry about that!`;
        throw new Error(errorMessage);
      }
    }
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

  isEmpty() {
    return this.listAllFiles().length == 0;
  },
});
