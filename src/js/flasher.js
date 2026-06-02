import { ESPLoader, Transport } from "esptool-js";

import { createLittleFsImage } from "./littlefs-image.js";

import { FileSystem } from "./file-system.js";

const SERIAL_BAUDRATE = 115200;
const LITTLEFS_PARTITION_OFFSET = 0x10000 + 0x100000; // from partitions.csv
const LITTLEFS_PARTITION_SIZE = 0x2f0000; // from partitions.csv
const MAX_FILENAME_LENGTH = 255;
const BLOCK_SIZE = 4096;
const BLOCK_COUNT = LITTLEFS_PARTITION_SIZE / BLOCK_SIZE;
// Proper hard-reset pulse: RTS true (EN low) -> wait -> RTS false (EN high, boots app).
// The built-in "hard_reset" only sets RTS false and never pulses EN, so it never resets.
const HARD_RESET_SEQUENCE = "R1|W100|R0";

export async function flashEsp() {
  // use esptool-js to flash the microcontroller
  // Request port access (user will be prompted to select a device)
  const port = await navigator.serial.requestPort();

  // Create transport instance
  const transport = new Transport(port, true);

  // Configure loader options
  const loaderOptions = {
    transport: transport,
    baudrate: SERIAL_BAUDRATE, // Communication baud rate
    debugLogging: false, // Optional debug logging
  };

  // Create ESPLoader instance
  const esploader = new ESPLoader(loaderOptions);

  try {
    // Connect and detect chip (this will reset the device)
    const chipName = await esploader.main();
    console.log(`Connected to: ${chipName}`);

    // Create the LittleFS image
    const allFiles = FileSystem.getAllFiles();
    const littleFsImage = await createLittleFsImage(
      allFiles,
      BLOCK_SIZE,
      BLOCK_COUNT,
      MAX_FILENAME_LENGTH,
    );

    if (!littleFsImage) {
      console.error("Failed to create LittleFS image");
      return;
    }

    // Configure flash options
    const flashOptions = {
      fileArray: [
        {
          data: littleFsImage,
          address: LITTLEFS_PARTITION_OFFSET, // Starting address in flash
        },
      ],
      flashMode: "dio", // Flash mode: "qio", "qout", "dio", "dout"
      flashFreq: "40m", // Flash frequency: "80m", "40m", "26m", "20m", etc.
      flashSize: "4MB", // Flash size: "256KB", "512KB", "1MB", "2MB", "4MB", etc.
      eraseAll: false, // Set to true to erase entire flash before writing
      compress: true, // Compress data during transfer
      reportProgress: (fileIndex, written, total) => {
        const percent = (written / total) * 100;
        console.log(`Progress: ${percent.toFixed(1)}%`);
      },
    };

    // Flash the firmware
    await esploader.writeFlash(flashOptions);

    // Reset the device after flashing so it boots the app (see HARD_RESET_SEQUENCE)
    await esploader.after("custom_reset", undefined, HARD_RESET_SEQUENCE);
  } catch (error) {
    console.error("Failed to connect:", error);
  } finally {
    try {
      await transport.disconnect();
    } catch (closeError) {
      // Reset can re-enumerate USB; the port may already be gone.
      console.debug("Port close after flash:", closeError);
    }
  }
}
