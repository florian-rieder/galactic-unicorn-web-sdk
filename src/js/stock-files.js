import { unzipSync } from "fflate";

const STOCK_FILES_ZIP_DOWNLOAD_URL =
  "https://florian-rieder.github.io/galactic-unicorn-data/data.zip";

let cache = {};

export const StockFiles = Object.freeze({
  async load() {
    const response = await fetch(STOCK_FILES_ZIP_DOWNLOAD_URL);

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
  },

  getAllFiles() {
    return cache;
  },
});
