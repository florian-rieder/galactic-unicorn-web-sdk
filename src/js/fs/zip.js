import { zipSync, unzipSync } from "fflate";

import { FileSystem } from "./file-system.js";

/**
 * Zip a record of file paths and their raw bytes into a single Uint8Array
 * @param {Record<string, Uint8Array>} files 
 * @returns {Uint8Array}
 */
export function zip(files) {
  // fflate expects raw Uint8Array as file data, which is perfect since it's
  // exactly what our FileSystem outputs ! Bingo !
  // And it accepts a flar array of filepaths, so we don't need to do anything

  // Zip the tree using fflate
  const zippedBytes = zipSync(files, {
    // These options are the defaults for all files, but file-specific
    // options take precedence.
    level: 1,
    // Set last modified time to now
    mtime: new Date(),
  });

  return zippedBytes;
}

/**
 * Unzip a single Uint8Array into a record of file paths and their raw bytes
 * @param {Uint8Array} zipBytes
 * @returns {Record<string, Uint8Array>} files
 */
export function unzip(zipBytes) {
  // Decompress data
  const decompressed = unzipSync(zipBytes);

  // Filter out directories from the list of files
  let files = Object.fromEntries(
    Object.entries(decompressed)
      .filter(([path, data]) => {
        return (
          !!path && // path is truthy
          data.length > 0 && // Filter out directories (no data)
          !path.includes("__MACOSX") && // Ignore macOS zip junk
          !path.includes(".DS_Store")
        );
      })
      .map(([k, v]) => [FileSystem.normalizePath(k), v]) // Normalize file paths
  );

  // Strip one leading path segment when every entry lives under the same folder
  // (e.g. Finder "Compress project/" -> project/main.lua -> /main.lua).
  files = stripSingleZipRoot(files);

  return files;
}

/**
 * Strip one leading path segment when every entry lives under the same folder
 * (e.g. Finder "Compress project/" -> project/main.lua -> /main.lua).
 *
 * @param {string[]} paths Normalized virtual paths.
 * @returns {string[]} Paths with the shared root removed, or unchanged.
 */
function stripSingleZipRootPrefix(paths) {
  if (paths.length === 0) {
    return paths;
  }

  const partsList = paths.map((path) =>
    path.split(FileSystem.PATH_SEPARATOR).filter((part) => part.length > 0)
  );

  const root = partsList[0][0];
  if (!root) {
    return paths;
  }

  const canStrip = partsList.every(
    (parts) => parts.length >= 2 && parts[0] === root
  );
  if (!canStrip) {
    return paths;
  }

  return partsList.map(
    (parts) =>
      FileSystem.PATH_SEPARATOR + parts.slice(1).join(FileSystem.PATH_SEPARATOR)
  );
}

/**
 * @param {Record<string, Uint8Array>} files
 * @returns {Record<string, Uint8Array>}
 */
function stripSingleZipRoot(files) {
  const paths = Object.keys(files);
  const strippedPaths = stripSingleZipRootPrefix(paths);
  if (paths.every((path, index) => path === strippedPaths[index])) {
    return files;
  }

  const remapped = {};
  for (let i = 0; i < paths.length; i++) {
    remapped[strippedPaths[i]] = files[paths[i]];
  }
  return remapped;
}
