local HEADER_SIZE_BYTES = 8


----------------------------------------------------------------------------------------------------
-- Frame decoding functions: 1/2/4/8/16 bits per pixel
----------------------------------------------------------------------------------------------------


-- 1 bit per pixel frame drawing: black or white, no exception
local function draw_frame_1bit_black_and_white(index, file)
  -- 25 bytes per frame for 1bpp at 20x10; 200 bits / 8 = 25 bytes
  local frame_size_bytes = SCREEN_W * SCREEN_H * 1 / 8
  local offset = HEADER_SIZE_BYTES + (index - 1) * frame_size_bytes
  local frame = read_file_chunk(file, offset, frame_size_bytes)

  for x = 0, SCREEN_W - 1 do
    for y = 0, SCREEN_H - 1 do
      local pixel_index = x + SCREEN_W * y
      local byte_index = math.floor(pixel_index / 8) + 1  -- +1 to make it 1-based for Lua string.byte
      local bit_index = 7 - (pixel_index % 8)  -- Most significant bit first (big-endian)
      local byte = string.byte(frame, byte_index)
      local is_white = (byte >> bit_index) & 1 ~= 0
      local val = is_white and 255 or 0

      set_pixel(x, y, rgb(val, val, val))
    end
  end
end

local function draw_frame_2bit_grayscale(index, file)
  -- 50 bytes per frame for 2bpp at 20x10; 200 bits * 2 / 8 = 50 bytes
  local frame_size_bytes = SCREEN_W * SCREEN_H * 2 / 8
  local offset = HEADER_SIZE_BYTES + (index - 1) * frame_size_bytes
  local frame = read_file_chunk(file, offset, frame_size_bytes)

  for x = 0, SCREEN_W - 1 do
    for y = 0, SCREEN_H - 1 do
      local pixel_index = x + SCREEN_W * y
      local byte_index = math.floor(pixel_index / 4) + 1
      local byte = string.byte(frame, byte_index)
      local i = pixel_index % 4 -- 0 for the first pixel of the byte, 1 for the second, 2 for the third, and 3 for the last
      local bit_mask = 3 << (6 - 2 * i) -- 11000000 for i=0; 00110000 for i=1; 00001100 for i=2; 00000011 for i=3 => 0b11 = 3 shifted left by (3 - i)
      local val = ((byte & bit_mask) >> (6 - 2 * i)) -- Shift the extracted 2 bits to the LSB position to get a value from 0-3
      local brightness = val * 85 -- then multiply by 85 to get a properly scaled brightness (0->0, 1->85, 2->170, 3->255)

      set_pixel(x, y, rgb(brightness, brightness, brightness))
    end
  end
end

local function draw_frame_4bit_grayscale(index, file)
  -- 100 bytes per frame for 4bpp at 20x10; 200 pixels * 4 bits = 800 bits / 8 = 100 bytes
  local frame_size_bytes = SCREEN_W * SCREEN_H * 4 / 8
  local offset = HEADER_SIZE_BYTES + (index - 1) * frame_size_bytes
  local frame = read_file_chunk(file, offset, frame_size_bytes)

  for x = 0, SCREEN_W - 1 do
    for y = 0, SCREEN_H - 1 do
      local pixel_index = x + SCREEN_W * y
      local byte_index = math.floor(pixel_index / 2) + 1
      local byte = string.byte(frame, byte_index)
      local val
      -- Each pixel is 4 bits so we need to check if it's the high nibble (even pixel index) or low nibble (odd pixel index)
      if pixel_index % 2 == 0 then
        val = byte >> 4   -- high nibble (first 4 bits, we shift it down to get a value from 0 to 15)
      else
        val = byte & 0x0F -- low nibble (AND 0x0F (00001111) masks out the high nibble, leaving only the low nibble)
      end

      -- Scale back to 0..255
      -- To get the factor, we divide 255 by the maximum value represented by the amount of bits that represent the shade
      val = val * 17 -- 255 / 15 (bin 1111) = 17
      set_pixel(x, y, rgb(val, val, val))
    end
  end
end

local function draw_frame_8bit_rgb332(index, file)
  -- 200 bytes per frame for 8bpp at 20x10; 200 pixels * 8 bits = 200 pixels * 1 byte = 200 bytes
  local frame_size_bytes = SCREEN_W * SCREEN_H * 8 / 8
  local offset = HEADER_SIZE_BYTES + (index - 1) * frame_size_bytes
  local frame = read_file_chunk(file, offset, frame_size_bytes)

  for x = 0, SCREEN_W - 1 do
    for y = 0, SCREEN_H - 1 do
      local pixel_index = x + SCREEN_W * y
      local byte_index = pixel_index + 1
      local byte = string.byte(frame, byte_index)
      -- Each pixel is 8 bits encoded as RRRGGGBB (what a beautiful table :o)
      local r = byte & 0xE0 -- mask: bin 11100000 -> (bin 1110 = dec 8 + 4 + 2 = 14 = hex E; bin 0000 = hex 0) -> hex 0xE0 
      local g = byte & 0x1C -- mask: bin 00011100 -> (bin 0001 = dec 1; bin 1100 = dec 8 + 4 = 12 = hex C) -> hex 0x1C
      local b = byte & 0x03 -- mask: bin 00000011 -> (bin 0000 = dec 0; bin 0011 = dec 2 + 1 = hex 3)

      -- Scale back to 0..255
      -- Naive: set_pixel(x, y, rgb(r, g << 3, b << 6))

      -- Using the scaling formula
      r = (r >> 5) * 36 -- leaves 3 that can't be represented :( because 255 / 7 = 36.4 => 36 => represents range 0..252
      g = (g >> 2) * 36 -- so range 0..252
      b = b * 85 -- 255 / 3 = 85 (because bin 11 == dec 3)
      set_pixel(x, y, rgb(r, g, b))
    end
  end
end

local function draw_frame_16bit_rgb565(index, file)
  -- 400 bytes per frame for 16bpp at 20x10; 200 pixels * 16 bits = 200 pixels * 2 bytes = 400 bytes
  local frame_size_bytes = SCREEN_W * SCREEN_H * 16 / 8
  local offset = HEADER_SIZE_BYTES + (index - 1) * frame_size_bytes
  local frame = read_file_chunk(file, offset, frame_size_bytes)

  for x = 0, SCREEN_W - 1 do
    for y = 0, SCREEN_H - 1 do
      local pixel_index = x + SCREEN_W * y
      local first_byte_index = pixel_index * 2 + 1
      local second_byte_index = pixel_index * 2 + 2
      local first_byte = string.byte(frame, first_byte_index)
      local second_byte = string.byte(frame, second_byte_index)

      -- 16bit RGB565 RRRRRGGG GGGBBBBB
      -- first byte                    RRRRRGGG
      local r = first_byte & 0xF8   -- mask: 11111000 = 1111 1000 = 0xF8
      local g1 = first_byte & 0x07  -- mask: 00000111 = 0000 0111 = 0x07
      -- second byte                   GGGBBBBB
      local g2 = second_byte & 0xE0 -- mask: 11100000 = (bin 1110 = dec 8 + 4 + 2 = 14 = hex E; bin 0000 = hex 0) = 0xE0
      local g = g1 << 5 | g2 >> 3   -- reorder the bits so that g2 follows g1. g1: 00000111 -> 11100000; g2: 22200000 -> 00022200 -> g1 | g2 = 11122200
      local b = (second_byte & 0x1F) << 3  -- mask: 00011111 -> (bin 0001 = hex 1; bin 1111 = hex F) -> 0x1F. Shift by 3 to the left to make the high bits 11111000

      -- Scale back to (close to) 0.255
      -- Naive (trivial since values are already in the high bits by definition):
      -- set_pixel(x, y, rgb(r, g, b))

      -- Using the scaling formula
      -- r = (r >> 3) * 8 -- 255 / 31 (bin 11111) = 8.2 => 8 => represents range 0..248
      -- g = (g >> 2) * 4 -- 255 / 63 (bin 111111) = 4.04 => 4 => represents range 0..252
      -- b = (b >> 3) * 8 -- 255 / (bin 11111) = 8.2 => 8 => represents range 0..248
      -- Wait, this is the exact same as what we had before ! But slower.
      -- set_pixel(x, y, rgb(r, g, b))

      -- Filling the low bits with the high bits (that way get get some sort of fake 0..255 range)
      r = r | (r >> 5) -- abcde000 -> abcdeabc
      g = g | (g >> 6) -- abcdef00 -> abcdefab
      b = b | (b >> 5) -- abcde000 -> abcdeabc

      set_pixel(x, y, rgb(r, g, b))
    end
  end
end

local ENCODINGS = {
  [1] = {
    name = "1bit-grayscale",
    bits_per_pixel = 1,
    drawer = draw_frame_1bit_black_and_white,
  },
  [2] = {
    name = "2bit-grayscale",
    bits_per_pixel = 2,
    drawer = draw_frame_2bit_grayscale,
  },
  [3] = {
    name = "4bit-grayscale",
    bits_per_pixel = 4,
    drawer = draw_frame_4bit_grayscale,
  },
  [4] = {
    name = "8bit-rgb332",
    bits_per_pixel = 8,
    drawer = draw_frame_8bit_rgb332,
  },
  [5] = {
    name = "16bit-rgb565",
    bits_per_pixel = 16,
    drawer = draw_frame_16bit_rgb565,
  },
}

local function read_header(file)
  --[[
    File layout:
    offset  size    field
    0       3       magic_number    -
    3       1       version         |
    4       1       encoding        |
    5       1       framerate       |- header
    6       1       width           |
    7       1       height          -
    8       ...     framedata
  ]] --
  local header = read_file_chunk(file, 0, HEADER_SIZE_BYTES)
  local magic_number = string.sub(header, 1, 3) -- First 3 bytes

  -- The first 3 bytes are ascii encoded so it just works !
  if magic_number ~= "GUV" then
    error("Invalid video file: incorrect magic number")
  end

  local version = string.byte(header, 4)
  local encoding = string.byte(header, 5)
  local framerate = string.byte(header, 6)
  local width = string.byte(header, 7)
  local height = string.byte(header, 8)

  assert(width == SCREEN_W and height == SCREEN_H, "Invalid height or width")

  if framerate == 0 then
    framerate = 30
  end

  if ENCODINGS[encoding] == nil then
    error("Invalid encoding")
  end

  -- Derive other metadata
  local size = file_size(file)
  local bytes_per_frame = width * height * ENCODINGS[encoding].bits_per_pixel / 8
  local payload = size - HEADER_SIZE_BYTES
  local total_frames = math.floor(payload / bytes_per_frame)

  return {
    version = version,
    encoding = encoding,
    framerate = framerate,
    frame_interval = 1 / framerate,
    bytes_per_frame = bytes_per_frame,
    total_frames = total_frames,
    file_size = size
  }
end


----------------------------------------------------------------------------------------------------
-- Module definition
----------------------------------------------------------------------------------------------------


local M = {
  playing = false,
  loop = false,
  file_path = nil,
  metadata = nil,
  accumulator = 0,
  frame_index = 1,
}

function M.play(video_path, on_video_end_callback)
  -- make callback an optional argument
  on_video_end_callback = on_video_end_callback or nil

  M.metadata = read_header(video_path)
  M.file_path = video_path
  M.accumulator = 0
  M.frame_index = 1
  M.playing = true
  M.on_video_end_callback = on_video_end_callback
end

function M.stop()
  M.playing = false

  -- Reset playback variables
  M.file_path = nil
  M.metadata = nil
  M.accumulator = 0
  M.frame_index = 1

  -- Run the video end callback provided by the user
  if M.on_video_end_callback ~= nil then
    M.on_video_end_callback()
  end
end

function M.pause()
  M.playing = false
end

function M.resume()
  M.playing = true
end

function M.update(dt)
  if not M.playing then return end

  M.accumulator = M.accumulator + dt

  -- If time interval between video frames has elapsed
  if M.accumulator >= M.metadata.frame_interval then
    -- set back the accumulator to stay in sync
    M.accumulator = M.accumulator - M.metadata.frame_interval

    -- increment frame index
    M.frame_index = M.frame_index + 1

    -- if we reached the end of the video
    if M.frame_index > M.metadata.total_frames then
      -- either loop or stop
      if M.loop then
        M.frame_index = 1
        print("looping")
      else
        M.stop()
        print("stopping")
      end
    end
  end
end

function M.draw()
  if not M.playing then return end

  if ENCODINGS[M.metadata.encoding] ~= nil then
    ENCODINGS[M.metadata.encoding].drawer(M.frame_index, M.file_path)
  end
end

return M
