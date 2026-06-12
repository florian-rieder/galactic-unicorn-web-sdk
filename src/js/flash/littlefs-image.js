/**
 * Modified from: https://github.com/hurzhurz/littlefs-image-creator/blob/main/index.html
 * Uses vendored lfs.js and lfs_js.js, copied at build time from
 * https://github.com/hurzhurz/littlefs-js/releases
 */

import {
  MemoryBlockDevice,
  LFS,
  LFS_O_CREAT,
  LFS_O_TRUNC,
  LFS_O_WRONLY,
  LFS_ERR_EXIST,
  LFS_ERR_NOSPC,
} from "../vendor/littlefs/lfs_js.js";

export async function createLittleFsImage(
  files,
  block_size,
  block_count,
  max_filename_length
) {
  if (block_size < 104) {
    throw new Error("Invalid block size!");
  }

  var bdev = new MemoryBlockDevice(block_size, block_count);
  var lfs = new LFS(bdev, -1, max_filename_length);

  await lfs.format();
  await lfs.mount();

  for (const [path, data] of Object.entries(files)) {
    // If the file path has directories and the directories don't already exist, create them
    const lfsPath = path.startsWith("/") ? path : "/" + path;
    await ensureDirs(lfs, lfsPath);

    let file = await lfs.open(
      lfsPath,
      LFS_O_WRONLY | LFS_O_CREAT | LFS_O_TRUNC
    );

    if (file < 0) {
      console.warn(
        `Failed to open '${lfsPath}' for writing, error code: ${file}`
      );
      continue;
    }

    let data_size = await file.write(data);

    await file.sync();

    if (data_size < 0) {
      if (data_size === LFS_ERR_NOSPC) {
        const capacity = block_size * block_count;
        throw new Error(
          `Not enough space in the LittleFS image to write '${lfsPath}'. ` +
            `The filesystem capacity is ${capacity} bytes. ` +
            `Remove some files and try again.`
        );
      } else {
        throw new Error(
          "writing file '" +
            lfsPath +
            "' failed with error code '" +
            data_size +
            "'"
        );
      }
    }
  }

  await lfs.unmount();

  // Return the raw bytes (Uint8Array)
  return dump_bin(bdev);
}

function dump_bin(bd) {
  // Allocate a byte array the size of the partition
  let binary = new Uint8Array(bd.block_count * bd.block_size);

  // Populate the array
  for (var i = 0; i < bd.block_count; i++) {
    // If the block exists
    if (bd._storage[i]) {
      // Copy the block bytes into our byte array
      for (const [idx, byte] of bd._storage[i].entries()) {
        binary[i * bd.block_size + idx] = byte;
      }
    } else {
      // If the block is empty, fill it with 0xFF (255)
      for (let idx = 0; idx < bd.block_size; idx++) {
        binary[i * bd.block_size + idx] = 0xff;
      }
    }
  }

  return binary;
}

// Helper to ensure all parent directories exist
async function ensureDirs(lfs, filePath) {
  const parts = filePath.split("/").filter((p) => p.length > 0);
  parts.pop(); // remove filename, keep only dirs
  let current = "";
  for (const part of parts) {
    current += "/" + part;
    // mkdir returns an error code rather than throwing; -17 (LFS_ERR_EXIST) is expected and fine
    const err = await lfs.mkdir(current);
    if (err < 0 && err !== LFS_ERR_EXIST) {
      console.error(
        `Failed to create directory '${current}', error code: ${err}`
      );
      return err;
    }
  }
  return 0;
}
