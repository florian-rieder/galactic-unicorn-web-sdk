import { Terminal } from "./terminal.js";

/**
 * Filesystem emulation using localStorage
 * We can use the path as localStorage key, and write base64 encoded data
 */

function isQuotaExceededError(err) {
  return err instanceof DOMException && err.name === "QuotaExceededError";
}

/**
 * @param {string} action e.g. "save /bigfile.mp4"
 * @param {Error} err
 */
function reportFsError(action, err) {
  let message = "";
  if (isQuotaExceededError(err)) {
    message = `Browser storage is full (${action}). Delete files, then try again.`;
  } else {
    message = `Could not ${action}: ${err instanceof Error ? err.message : String(err)}`;
  }
  Terminal.printLine(`[Filesystem] ${message}`);
  console.error(err);
}

/**
 * Writes raw bytes to file storage at the given path
 * @param {String} path
 * @param {Uint8Array} data
 * @returns {boolean} whether the write succeeded
 */
export function writeFile(path, data) {
  // Convert raw data to a binary string; we transform an int between 0 and 255
  // into a character using fromCharCode()
  const binaryChars = Array.from(data, (val) => String.fromCharCode(val));
  const binaryString = binaryChars.join("");
  // Encode binary string to base64 for storage
  const base64EncodedData = btoa(binaryString);

  try {
    localStorage.setItem(path, base64EncodedData);
    return true;
  } catch (err) {
    reportFsError(`save ${path}`, err);
    return false;
  }
}

/**
 * Read a file at the given path from the emulated file system
 * Design decision: we return a Uint8Array (raw bytes) no matter what the file is.
 * Caller can then decode the bytes into whatever they want to.
 *
 * For example, to decode into a string:
 * ```js
 * const decodedString = new TextDecoder().decode(raw_bytes);
 * ```
 *
 * @param {String} path
 * @returns {Uint8Array} raw bytes read from the file at path or null if it failed to read a file
 */
export function readFile(path) {
  let encoded = localStorage.getItem(path);
  if (encoded === null) {
    console.error("Failed to open file " + path);
    return null;
  }

  // Decode base64 encoded string into binary string
  // Each character in the string has a charCodeAt() value between 0 and 255
  let decoded = atob(encoded);

  // Turn into Uint8Array (raw bytes)
  let bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    // Obtaining the charCode of the character allows us to translate it back
    // into a byte (int value between 0 and 255)
    bytes[i] = decoded.charCodeAt(i);
  }

  // Return the raw bytes to the caller
  return bytes;
}

/**
 * Read a specific chunk of a file in the virtual file system
 * @param {String} path path of the file in the virtual file system
 * @param {int} offset start position of the chunk in bytes
 * @param {int} size size of the chunk in bytes
 * @returns {Uint8Array|null} raw byte array representing the chunk of data from the file
 */
export function readFileChunk(path, offset, size) {
  // Inefficient emulation of chunked reading. We can't really read only a chunk
  // of a value from localStorage
  const file = readFile(path);
  if (file === null) return null;
  return file.subarray(offset, offset + size);
}

/**
 * Get the size of a file in the virtual file system
 * @param {String} path
 * @returns {int} size of the file in bytes
 */
export function fileSizeAtPath(path) {
  // This is inefficient. We could probably store the file size in the
  // localStorage item as metadata in some way instead.
  let file = readFile(path);
  let size = 0;
  if (file !== null) {
    size = file.length;
  }
  return size;
}

/**
 * Check if a file exists in the virtual file system
 * @param {String} path
 * @returns {bool} whether the file exists
 */
export function fileExists(path) {
  return localStorage.getItem(path) !== null;
}

/**
 * Remove a file from the virtual file system
 * @param {String} path
 */
export function deleteFile(path) {
  try {
    localStorage.removeItem(path);
  } catch (err) {
    reportFsError(`delete ${path}`, err);
  }
}

/**
 * Move file data to a new path in the virtual file system
 * @param {String} oldPath
 * @param {String} newPath
 * @returns {boolean} whether the rename succeeded
 */
export function renameFile(oldPath, newPath) {
  if (oldPath === newPath) {
    return true;
  }
  if (!fileExists(oldPath) || fileExists(newPath)) {
    return false;
  }

  const data = readFile(oldPath);
  if (data === null || data === undefined) {
    return false;
  }

  // We delete the old file first so we don't risk a quota exceeded error just to rename it.
  deleteFile(oldPath);

  if (!writeFile(newPath, data)) {
    // This should never happen since we just freed the exact size of the file.
    // Hopefully it doesn't.
    // If it does, we'll try to best-effort restore the file.
    if (!writeFile(oldPath, data)) {
      // Welp... Oops. We're out of luck. This should never ever happen.
      const errorMessage =
        `[Filesystem] Failed to restore file ${oldPath} after rename failure.\n` +
        `The data has been lost. Sorry about that!`;
      Terminal.printLine(errorMessage);
      console.error(errorMessage);
    }
    return false;
  }

  return true;
}

/**
 * List files in the file system
 * @param {String} prefix defaults to "/"
 * @returns list of file paths that begin with the prefix
 */
export function listFiles(prefix = "/") {
  // Prevent listing localStorage methods as file paths
  if (prefix === "") prefix = "/";

  let filesList = [];
  for (let key in localStorage) {
    if (key.startsWith(prefix)) {
      filesList.push(key);
    }
  }

  return filesList;
}
