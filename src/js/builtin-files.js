import { unzipSync } from "fflate";

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
      const decompressed = unzipSync(view);

      // Filter out directories from the list of files
      cache = Object.fromEntries(
        Object.entries(decompressed)
          .filter(([_, v]) => v.length > 0)
          .map(([k, v]) => ["/" + k, v])
      );
    } catch (e) {
      // In case of error, seed an empty object to prevent startup crash
      cache = {};
    }
  },

  readFile(path) {
    if (!cacheExists()) throw new Error("Cache doesn't exist");
    return cache[path];
  },

  fileSizeAtPath(path) {
    const data = cache[path];

    if (!data) {
      throw new Error("File doesn't exist in built-in files cache: " + path);
    }

    return data.length;
  },

  listAllFiles() {
    if (!cacheExists()) throw new Error("Cache doesn't exist");
    return Object.keys(cache);
  },

  getAllFiles() {
    if (!cacheExists()) throw new Error("Cache doesn't exist");
    return cache;
  },
});

function cacheExists() {
  return !!cache;
}
