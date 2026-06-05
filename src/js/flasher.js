/**
 * Flash the LittleFS partition of a device connected via USB through esptool-js
 *
 * @see https://github.com/espressif/esptool-js/blob/main/README.md
 */

import { ESPLoader, Transport } from "esptool-js";
import { unzipSync } from "fflate";

import { createLittleFsImage } from "./littlefs-image.js";

import { FileSystem } from "./file-system.js";
import { Terminal } from "./terminal.js";

// Flavor text printed at the start of flashing
const HEADER_LINE = "FUGU: Flashing Utility for Galactic Unicorn";

const STOCK_FILES_ZIP_DOWNLOAD_URL =
  "https://florian-rieder.github.io/galactic-unicorn-data/data.zip";

// esptool-js debug knobs
const DEBUG_TRANSPORT_TRACING = false;
const DEBUG_LOGGING_LOADER = false;

// LittleFS image configuration
// from partitions.csv (previous chunk offset + size = this partition's offset in bytes)
const LITTLEFS_PARTITION_OFFSET = 0x10000 + 0x100000;
// from partitions.csv (this partition's size in bytes)
const LITTLEFS_PARTITION_SIZE = 0x2f0000;
const MAX_FILENAME_LENGTH = 255;
const BLOCK_SIZE = 4096;
const BLOCK_COUNT = LITTLEFS_PARTITION_SIZE / BLOCK_SIZE;

// Flash options for esptool
const SERIAL_BAUDRATE = 115200;
// see https://docs.espressif.com/projects/esptool/en/latest/esp32c6/esptool/flash-modes.html
const FLASH_MODE = "dio"; // Flash mode: "qio", "qout", "dio", "dout"
const FLASH_FREQUENCY = "40m"; // Flash frequency: "80m", "40m", "26m", "20m", etc.
const FLASH_SIZE = "4MB"; // Flash size: "256KB", "512KB", "1MB", "2MB", "4MB", etc.
const FLASH_ERASE_ALL = false; // Set to true to erase entire flash before writing
const FLASH_COMPRESS = true; // Compress data during transfer

// Proper hard-reset pulse: RTS true (EN low) -> wait -> RTS false (EN high, boots app).
// The built-in "hard_reset" only sets RTS false and never pulses EN, so it never resets.
const HARD_RESET_SEQUENCE = "R1|W100|R0";

// Pipe esptool's output to our user-facing SDK console
const TERMINAL_CONFIG = {
  clean() {
    /* Don't worry, we're gonna handle clearing the terminal ourselves */
  },
  writeLine(data) {
    // For some reason, esptool-js finds a Flash ID of 0 and therefore emits this warning.
    // However, it's a false alarm and the flash does happen correctly.
    // So let's filter out noise
    const excludedLines = [
      "esptool.js",
      "Flash ID: 0",
      `WARNING: Failed to communicate with the flash chip,\nread/write operations will fail.\nTry checking the chip connections or removing\nany other hardware connected to IOs.`,
    ];

    if (excludedLines.includes(data.trim())) return;

    Terminal.printLine(data);
  },
  write(data) {
    Terminal.print(data);
  },
};

let stockFilesCache;

/**
 * EspFlasher namespace
 */
export const EspFlasher = Object.freeze({
  /**
   * Flash the connected device with an image of the current project's file system.
   *
   * @param {Object} [callbacks]
   * @param {Function} [callbacks.onPortSelected] Invoked after the user picks a serial port (awaited).
   * @param {Function} [callbacks.onConnecting] Invoked just before connecting to the chip.
   * @param {Function} [callbacks.onProgress] Invoked during writeFlash with (fileIndex, written, total).
   * @returns {Promise<number|null>} Elapsed ms on success, or null if the port dialog was cancelled.
   */
  async flash({ onPortSelected, onConnecting, onProgress } = {}) {
    let port = null;
    try {
      // Request port access (user will be prompted to select a device)
      port = await navigator.serial.requestPort();
    } catch (error) {
      // User cancelled the port selection dialog, do nothing.
      return null;
    }

    if (onPortSelected) {
      await onPortSelected();
    }

    Terminal.clear();
    Terminal.printLine(HEADER_LINE);

    // Create the LittleFS image
    const userFiles = FileSystem.getAllFiles();

    let stockFiles = {};

    if (stockFilesCache) {
      Terminal.printLine("Reusing cached stock files");
      stockFiles = stockFilesCache;
    } else {
      Terminal.printLine("Downloading stock files...");
      try {
        const response = await fetch(STOCK_FILES_ZIP_DOWNLOAD_URL);

        if (!response.ok) {
          throw new Error("Failed to fetch");
        }

        // Get raw zip file data
        const buffer = await response.arrayBuffer();
        const view = new Uint8Array(buffer);

        // Decompress data
        const decompressed = unzipSync(view);

        stockFiles = Object.fromEntries(
          // Filter out directories
          Object.entries(decompressed).filter(([_, v]) => v.length > 0)
        );

        stockFilesCache = stockFiles; // Cache stockFiles for this session
      } catch (error) {
        console.error(
          `Failed to download stock files from ${STOCK_FILES_ZIP_DOWNLOAD_URL}: ${error.message}`
        );
        console.error(error);
        // Non fatal
        Terminal.printLine(
          "Failed to download stock files. Proceeding with user files only. (This may result in an unbootable device)"
        );
      }
    }

    Terminal.printLine("Merging files...");

    // Combine VFS files with stock files
    // User files have precedence over stock files
    const allFiles = { ...stockFiles, ...userFiles };

    Terminal.printLine("Building file system image... ");

    const littleFsImage = await createLittleFsImage(
      allFiles,
      BLOCK_SIZE,
      BLOCK_COUNT,
      MAX_FILENAME_LENGTH
    );

    if (!littleFsImage) {
      throw new Error("Failed to create file system image");
    }

    Terminal.printLine(`Done. littlefs.bin (${littleFsImage.length} bytes)`);

    // ESP-32 C6: VendorID 0x303a ProductID 0x1001
    // Create transport instance
    const transport = new Transport(port, DEBUG_TRANSPORT_TRACING);

    // Configure loader options
    const loaderOptions = {
      transport: transport,
      baudrate: SERIAL_BAUDRATE, // Communication baud rate
      debugLogging: DEBUG_LOGGING_LOADER, // Optional debug logging
      terminal: TERMINAL_CONFIG,
    };

    // Create ESPLoader instance
    const esploader = new ESPLoader(loaderOptions);

    let flashStart;

    try {
      if (onConnecting) onConnecting();

      // Connect and detect chip (this will reset the device)
      const chipName = await esploader.main();
      console.debug(`Connected to: ${chipName}`);

      // Start counting flash duration AFTER the chip has connected
      flashStart = performance.now();

      // Configure flash options
      const flashOptions = {
        fileArray: [
          {
            data: littleFsImage, // Raw bytes (Uint8Array)
            address: LITTLEFS_PARTITION_OFFSET, // Starting address in flash
          },
        ],
        flashMode: FLASH_MODE,
        flashFreq: FLASH_FREQUENCY,
        flashSize: FLASH_SIZE,
        eraseAll: FLASH_ERASE_ALL,
        compress: FLASH_COMPRESS,
        reportProgress: onProgress,
      };

      // Flash the firmware
      await esploader.writeFlash(flashOptions);

      // Reset the device after flashing so it boots the app (see HARD_RESET_SEQUENCE)
      await esploader.after("custom_reset", undefined, HARD_RESET_SEQUENCE);
    } catch (error) {
      throw new Error(
        `Flash failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      try {
        await transport.disconnect();
      } catch (closeError) {
        // Reset can re-enumerate USB; the port may already be gone.
        console.debug("Port close after flash:", closeError);
      }
    }

    return performance.now() - flashStart;
  },
});
