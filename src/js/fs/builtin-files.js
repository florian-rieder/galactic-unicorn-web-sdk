import { unzip } from "./zip.js";

const BUILTIN_FILES_ZIP_DOWNLOAD_URL =
  "https://florian-rieder.github.io/galactic-unicorn-data/data.zip";

let cache;

export const BuiltinFiles = Object.freeze({
  /**
   * Populate the builtin files cache. Necessary to use other methods
   */
  async load() {
    if (cacheExists()) return;

    try {
      const response = await fetch(BUILTIN_FILES_ZIP_DOWNLOAD_URL);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Get raw zip file data
      const buffer = await response.arrayBuffer();
      const view = new Uint8Array(buffer);

      // Decompress data
      cache = unzip(view);
    } catch (e) {
      // In case of error, seed an empty object to prevent startup crash
      cache = {};
    }
  },

  /**
   * Read a file at the given path from the built-in files
   *
   * For example, to decode into a string:
   * ```js
   * const decodedString = new TextDecoder().decode(raw_bytes);
   * ```
   *
   * @param {String} path
   * @returns {Uint8Array} raw bytes read from the file at path or errors if it failed to read a file
   */
  readFile(path) {
    if (!cacheExists()) throw new Error("Cache doesn't exist");
    if (!cache[path])
      throw new Error("File doesn't exist in built-in files cache: " + path);
    return cache[path];
  },

  /**
   * Read a specific chunk of a file in the built-in files
   *
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
   * Get the size of a file in the built-in files
   *
   * @param {String} path
   * @returns {int} size of the file in bytes
   */
  fileSizeAtPath(path) {
    const data = cache[path];

    if (!data) {
      throw new Error("File doesn't exist in built-in files cache: " + path);
    }

    return data.length;
  },

  /**
   * List all files in the built-in files
   *
   * @returns {string[]} list of file paths
   */
  listAllFiles() {
    if (!cacheExists()) throw new Error("Cache doesn't exist");
    return Object.keys(cache);
  },

  /**
   * Read all files from the built-in files
   *
   * @returns {Record<string, Uint8Array>} files
   */
  getAllFiles() {
    if (!cacheExists()) throw new Error("Cache doesn't exist");
    return cache;
  },
});

function cacheExists() {
  return !!cache;
}
