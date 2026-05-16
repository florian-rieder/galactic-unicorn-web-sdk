/**
 * Filesystem emulation using localStorage
 * We can use the path as localStorage key, and write base64 encoded data
 */

/**
 * Writes raw bytes to file storage at the given path
 * @param {String} path 
 * @param {Uint8Array} data 
 */
export function writeFile(path, data) {
  // Convert raw data to a binary string; we transform an int between 0 and 255
  // into a character using fromCharCode()
  const binaryString = Array.from(data, val => String.fromCharCode(val)).join("");
  // Encode binary string to base64 for storage
  const base64EncodedData = btoa(binaryString);

  try {
    localStorage.setItem(path, base64EncodedData);
  } catch (e) {
    console.error(e);
  }
}

/**
 * Read a file at the given path from the emulated file system
 * @param {String} path 
 * @returns {Uint8Array} raw bytes read from the file at path or null if it failed to read a file
 */
export function readFile(path) {
  let encoded = localStorage.getItem(path);
  if (encoded === null) {
    console.error("Failed to open file " + path);
    return;
  }

  // Decode base64 encoded string into binary string
  // Each character in the string has a charCodeAt() value between 0 and 255
  let decoded = atob(encoded);

  // Turn into Uint8Array
  let bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) {
    // Obtaining the charCode of the character allows us to translate it back
    // into a byte (int value between 0 and 255)
    bytes[i] = decoded.charCodeAt(i);
  }

  // We can then return this unified data representation to the user
  // It can be turned back into a UTF-8 string using:
  // decodedString = new TextDecoder().decode(uint8array);
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
 * List files in the file system
 * @param {String} prefix defaults to "/"
 * @returns list of file paths that begin with the prefix
 */
export function listFiles(prefix="/") {
  // Prevent listing localStorage methods as file paths
  if (prefix === "") prefix = "/";

  let filesList = []
  for (let key in localStorage) {
    if (key.startsWith(prefix)) {
      filesList.push(key)
    }
  }

  return filesList;
}