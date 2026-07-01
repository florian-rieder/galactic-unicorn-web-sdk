/**
 * Lua SDK API definitions.
 *
 * Fengari C bindings exposed to user scripts, plus the registries
 * (`LUA_API_FUNCTIONS`, `LUA_API_CONSTANTS`, `LUA_API_CALLBACKS`) and JSDoc
 * used by `scripts/generate_lua_api.py`. This file describes what the API is.
 */

import fengari from "../vendor/fengari.js";
const { lua, lauxlib, to_luastring } = fengari;

/** Helpers */
import { readRgbTableArg, pushRgbTable } from "./lua-utils.js";
import { hslToRgb } from "../color.js";

/** Hardware emulation */
import { Display } from "../display.js";
import { Input } from "../input.js";
import { FileSystem } from "../fs/file-system.js";
import { BuiltinFiles } from "../fs/builtin-files.js";
import { Terminal } from "../terminal.js";
import { Buzzer } from "../buzzer.js";
import { FileExplorer } from "../file-explorer.js";

/**
 * List of Lua API functions.
 * @type {Array<{luaName: string, luaFunction: function}>}
 */
export const LUA_API_FUNCTIONS = [
  { luaName: "print", luaFunction: lua_print },
  { luaName: "rgb", luaFunction: lua_rgb },
  { luaName: "hsl", luaFunction: lua_hsl },
  { luaName: "get_pixel", luaFunction: lua_getPixel },
  { luaName: "set_pixel", luaFunction: lua_setPixel },
  { luaName: "set_pixel_blend", luaFunction: lua_setPixelBlend },
  { luaName: "set_pixel_f", luaFunction: lua_setPixelF },
  {
    luaName: "set_unsafe_pixel_brightness",
    luaFunction: lua_setUnsafePixelBrightness,
  },
  { luaName: "rect", luaFunction: lua_rect },
  { luaName: "rect_blend", luaFunction: lua_rectBlend },
  { luaName: "rect_f", luaFunction: lua_rectF },
  { luaName: "fill", luaFunction: lua_fill },
  { luaName: "fill_blend", luaFunction: lua_fillBlend },
  { luaName: "is_pressed", luaFunction: lua_isPressed },
  { luaName: "get_time", luaFunction: lua_getTime },
  { luaName: "clear", luaFunction: lua_clear },
  { luaName: "buzz", luaFunction: lua_buzz },
  { luaName: "read_file", luaFunction: lua_readFile },
  { luaName: "read_file_chunk", luaFunction: lua_readFileChunk },
  { luaName: "file_size", luaFunction: lua_fileSize },
  { luaName: "list_directory", luaFunction: lua_listDirectory },
];

/**
 * List of Lua API constants.
 * @type {Array<{name: string, type: string, value: number, description: string}>}
 */
export const LUA_API_CONSTANTS = [
  {
    name: "SCREEN_W",
    type: "number",
    value: 20, // Dirty hardcoding needed for API docs generation but display resolution isn't likely to change.
    description: "Screen width in pixels",
  },
  {
    name: "SCREEN_H",
    type: "number",
    value: 10,
    description: "Screen height in pixels",
  },
];

/**
 * List of Lua lifecycle callbacks implemented by the user in Lua and called by the host.
 * Unused from JavaScript. Used to generate API docs.
 *
 * @type {Array<{luaName: string, luaFunction: function}>}
 */
const LUA_API_CALLBACKS = [
  { luaName: "setup", luaFunction: lua_callback_setup },
  { luaName: "update", luaFunction: lua_callback_update },
  { luaName: "draw", luaFunction: lua_callback_draw },
  { luaName: "process", luaFunction: lua_callback_process },
  { luaName: "on_press", luaFunction: lua_callback_onPress },
  { luaName: "on_release", luaFunction: lua_callback_onRelease },
];

/**
 * Lua function definitions
 */

/**
 * Write a line to the SDK console panel.
 *
 * Handy for quick debugging while you are iterating on game logic.
 *
 * Lua API: `print(message)`
 * (This replaces the default Lua `print`)
 *
 * @luaName print
 * @luaKind function
 * @luaCategory console
 * @luaParam messages:variable Lua variables to print
 * @luaReturns nil
 * @luaExample print("Hello, world!")       -- Output: Hello, world!
 * print("Hello", 1, true, nil) -- Output: Hello    1    true    nil
 *
 * @param {LuaState} L - Fengari Lua state; message is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_print(L) {
  const nargs = lua.lua_gettop(L); // How many arguments were passed
  const parts = [];

  for (let i = 1; i <= nargs; i++) {
    lua.lua_getglobal(L, "tostring"); // Call lua tostring() on the argument
    lua.lua_pushvalue(L, i);

    if (lua.lua_pcall(L, 1, 1, 0) === 0) {
      parts.push(lua.lua_tojsstring(L, -1));
    } else {
      // tostring() failed, get the error message
      parts.push(`<error: ${lua.lua_tojsstring(L, -1)}>`);
    }
    lua.lua_pop(L, 1);
  }

  Terminal.printLine(parts.join("\t"));
  return 0;
}

/**
 * Create an RGB color table.
 *
 * Lua API: `rgb(r, g, b)` -> `{r, g, b}`
 *
 * @luaName rgb
 * @luaKind function
 * @luaCategory color
 * @luaParam r:number red channel (0-255)
 * @luaParam g:number green channel (0-255)
 * @luaParam b:number blue channel (0-255)
 * @luaReturns `table` RGB color table `{r, g, b}`
 * @luaExample local red = rgb(255, 0, 0)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..3.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_rgb(L) {
  const r = lauxlib.luaL_checkinteger(L, 1);
  const g = lauxlib.luaL_checkinteger(L, 2);
  const b = lauxlib.luaL_checkinteger(L, 3);

  lauxlib.luaL_argcheck(L, r >= 0 && r <= 255, 1, "r out of range 0..255");
  lauxlib.luaL_argcheck(L, g >= 0 && g <= 255, 2, "g out of range 0..255");
  lauxlib.luaL_argcheck(L, b >= 0 && b <= 255, 3, "b out of range 0..255");

  pushRgbTable(L, r, g, b);
  return 1;
}

/**
 * Convert HSL values to an RGB color table.
 *
 * Lua API: `hsl(h, s, l)` -> `{r, g, b}`
 *
 * `h` is wrapped over 360 degrees, `s` and `l` are clamped to `0..1`.
 *
 * @luaName hsl
 * @luaKind function
 * @luaCategory color
 * @luaParam h:number hue in degrees (any number, wrapped mod 360)
 * @luaParam s:number saturation (0.0..1.0)
 * @luaParam l:number lightness (0.0..1.0)
 * @luaReturns `table` RGB color table `{r, g, b}`
 * @luaExample local cyan = hsl(180, 1.0, 0.5)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..3.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_hsl(L) {
  const hInput = lua.lua_tonumber(L, 1);
  const sInput = lua.lua_tonumber(L, 2);
  const lInput = lua.lua_tonumber(L, 3);
  const rgb = hslToRgb(hInput, sInput, lInput);
  pushRgbTable(L, rgb.r, rgb.g, rgb.b);
  return 1;
}

/**
 * Read the current color of one pixel.
 *
 * Useful for effects that react to what is already drawn (sampling, simple
 * collision checks against color, post-processing tricks, etc.).
 *
 * Lua API: `get_pixel(x, y)` -> `{r, g, b}`
 *
 * @luaName get_pixel
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number integer pixel x coordinate (0-based)
 * @luaParam y:number integer pixel y coordinate (0-based)
 * @luaReturns `table` RGB color table `{r, g, b}`
 * @luaExample set_pixel(0, 0, rgb(42, 0, 134))
 *
 * local my_color = get_pixel(0, 0)
 *
 * print(my_color[1]) -- 42
 * print(my_color[2]) -- 0
 * print(my_color[3]) -- 134
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..2.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_getPixel(L) {
  const x = lua.lua_tointeger(L, 1);
  const y = lua.lua_tointeger(L, 2);
  let pixel = Display.getPixel(x, y);
  if (pixel === undefined) {
    pixel = [0, 0, 0]; // Default to black if the pixel is out of bounds.
  }

  pushRgbTable(L, pixel[0], pixel[1], pixel[2]);
  return 1;
}

/**
 * Set one pixel to an RGB color.
 *
 * This is the most direct drawing primitive: great for point effects, particles,
 * and any algorithm that draws pixel by pixel.
 *
 * Lua API: `set_pixel(x, y, {r, g, b})`
 *
 * @luaName set_pixel
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number pixel x coordinate (0-based)
 * @luaParam y:number pixel y coordinate (0-based)
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaReturns nil
 * @luaExample set_pixel(3, 2, rgb(255, 0, 0))
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..5.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setPixel(L) {
  const x = lua.lua_tointeger(L, 1);
  const y = lua.lua_tointeger(L, 2);
  const [r, g, b] = readRgbTableArg(L, 3);

  Display.setPixel(x, y, r, g, b);
  return 0;
}

/**
 * Blend a color onto one pixel instead of replacing it.
 *
 * Use this for transparency and softer visuals (trails, fades...) by mixing
 * with the color that is already on screen.
 *
 * Lua API: `set_pixel_blend(x, y, {r, g, b}, alpha)`
 *
 * @luaName set_pixel_blend
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number integer pixel x coordinate (0-based)
 * @luaParam y:number integer pixel y coordinate (0-based)
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaParam alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
 * @luaReturns nil
 * @luaExample set_pixel_blend(3, 2, rgb(255, 0, 0), 0.5)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..6.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setPixelBlend(L) {
  const x = lua.lua_tointeger(L, 1);
  const y = lua.lua_tointeger(L, 2);
  const [r, g, b] = readRgbTableArg(L, 3);
  const alpha = lua.lua_tonumber(L, 4);

  Display.setPixelBlend(x, y, r, g, b, alpha);
  return 0;
}

/**
 * Draw a point using floating-point coordinates.
 *
 * Applies bilinear interpolation to spread out brightness on the surrounding pixels
 * based on floating-point coordinates.
 * Useful for smooth movement/animation where object positions are in floating-point
 * coordinates.
 *
 * Lua API: `set_pixel_f(x, y, {r, g, b})`
 *
 * @luaName set_pixel_f
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number subpixel x coordinate (float, 0-based)
 * @luaParam y:number subpixel y coordinate (float, 0-based)
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaReturns nil
 * @luaExample set_pixel_f(3.25, 2.75, rgb(0, 255, 0))
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..5.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setPixelF(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const [r, g, b] = readRgbTableArg(L, 3);

  Display.setPixelF(x, y, r, g, b);
  return 0;
}

/**
 * UNSAFE !!! Set the brightness of a pixel.
 *
 * This is useful for setting the brightness of a pixel to a value that is different from
 * the default brightness, for short-term effects like flashing.
 * In the web SDK, shows a corona effect on the display to simulate the brightness effect.
 * If the total current exceeds the limit, an error checkerboard pattern will be
 * displayed (currently not supported in the web SDK).
 * Use with moderation.
 *
 * Lua API: `set_unsafe_pixel_brightness(x, y, brightness)`
 *
 * @luaName set_unsafe_pixel_brightness
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number pixel x coordinate (0-based)
 * @luaParam y:number pixel y coordinate (0-based)
 * @luaParam brightness:number brightness value (0..9)
 * @luaReturns nil
 * @luaExample set_unsafe_pixel_brightness(3, 2, 5)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..3.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setUnsafePixelBrightness(L) {
  const x = lua.lua_tointeger(L, 1);
  const y = lua.lua_tointeger(L, 2);
  const brightness = lua.lua_tonumber(L, 3);

  lauxlib.luaL_argcheck(
    L,
    brightness >= 0 && brightness <= 9,
    3,
    "brightness out of range 0..9"
  );

  // Does nothing in the web version, but available on the hardware.
  // TODO: emulate the error behavior in the web version.

  Display.setUnsafePixelBrightness(x, y, brightness);

  return 0;
}

/**
 * Draw a rectangle using floating-point coordinates.
 *
 * Applies bilinear interpolation to spread out brightness on the surrounding pixels
 * based on floating-point coordinates.
 * Useful for smooth movement/animation where object positions are in floating-point
 * coordinates.
 *
 * Lua API: `rect_f(x, y, w, h, {r, g, b})`
 *
 * @luaName rect_f
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number rectangle x coordinate (float, 0-based)
 * @luaParam y:number rectangle y coordinate (float, 0-based)
 * @luaParam w:number rectangle width (float)
 * @luaParam h:number rectangle height (float)
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaReturns nil
 * @luaExample rect_f(1.2, 1.2, 5.5, 3.5, rgb(0, 0, 255))
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..5.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_rectF(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const w = lua.lua_tonumber(L, 3);
  const h = lua.lua_tonumber(L, 4);
  const [r, g, b] = readRgbTableArg(L, 5);
  Display.rectF(x, y, w, h, r, g, b);
  return 0;
}

/**
 * Draw a filled axis-aligned rectangle.
 *
 * Great for UI blocks, paddles, bars, and simple game objects.
 *
 * Lua API: `rect(x, y, w, h, {r, g, b})`
 *
 * Notes:
 * - The host accepts floats for `x`, `y`, `w`, `h` and floors geometry internally.
 *
 * @luaName rect
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number rectangle x coordinate (float accepted; floored)
 * @luaParam y:number rectangle y coordinate (float accepted; floored)
 * @luaParam w:number rectangle width (float accepted; floored)
 * @luaParam h:number rectangle height (float accepted; floored)
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaReturns nil
 * @luaExample rect(1, 1, 5, 3, rgb(255, 255, 255))
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..5.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_rect(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const w = lua.lua_tonumber(L, 3);
  const h = lua.lua_tonumber(L, 4);
  const [r, g, b] = readRgbTableArg(L, 5);
  Display.rect(x, y, w, h, r, g, b);
  return 0;
}

/**
 * Blend a filled rectangle with what is already on screen.
 *
 * Useful for overlays, tint zones, and soft UI panels.
 *
 * Lua API: `rect_blend(x, y, w, h, {r, g, b}, alpha)`
 *
 * @luaName rect_blend
 * @luaKind function
 * @luaCategory display
 * @luaParam x:number rectangle x coordinate (float, 0-based)
 * @luaParam y:number rectangle y coordinate (float, 0-based)
 * @luaParam w:number rectangle width (float)
 * @luaParam h:number rectangle height (float)
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaParam alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
 * @luaReturns nil
 * @luaExample rect_blend(0, 0, SCREEN_W, SCREEN_H, rgb(255, 0, 0), 0.5)

 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..6.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_rectBlend(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const w = lua.lua_tonumber(L, 3);
  const h = lua.lua_tonumber(L, 4);
  const [r, g, b] = readRgbTableArg(L, 5);
  const alpha = lua.lua_tonumber(L, 6);
  Display.rectBlend(x, y, w, h, r, g, b, alpha);
  return 0;
}

/**
 * Clear the screen to black (`rgb(0, 0, 0)`).
 *
 * Equivalent to `fill(rgb(0, 0, 0))` and commonly used at the start of `draw()`.
 *
 * Lua API: `clear()`
 *
 * @luaName clear
 * @luaKind function
 * @luaCategory display
 * @luaReturns nil
 * @luaExample clear()
 *
 * @param {LuaState} L - Fengari Lua state; no arguments.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_clear(L) {
  Display.clear();
  return 0;
}

/**
 * Fill the entire screen with one color.
 *
 * Most scripts call this at the start of `draw()` to clear the previous frame
 * and paint a background color in one call.
 *
 * Lua API: `fill({r, g, b})`
 *
 * @luaName fill
 * @luaKind function
 * @luaCategory display
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaReturns nil
 * @luaExample fill(rgb(255, 0, 0))
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_fill(L) {
  const [r, g, b] = readRgbTableArg(L, 1);
  Display.fill(r, g, b);
  return 0;
}

/**
 * Blend one color over the whole screen.
 *
 * This keeps existing pixels visible while tinting the frame, which is useful
 * for fades, flashes, and mood/color shifts.
 *
 * Lua API: `fill_blend({r, g, b}, alpha)`
 *
 * @luaName fill_blend
 * @luaKind function
 * @luaCategory display
 * @luaParam rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaParam alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
 * @luaReturns nil
 * @luaExample fill_blend(rgb(255, 0, 0), 0.5)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..2.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_fillBlend(L) {
  const [r, g, b] = readRgbTableArg(L, 1);
  const alpha = lua.lua_tonumber(L, 2);
  Display.fillBlend(r, g, b, alpha);
  return 0;
}

/**
 * Check whether a mapped button is currently held down.
 *
 * Use this inside `update()` for continuous input (movement while a key is
 * held), as opposed to one-shot input events from `on_press`/`on_release`.
 *
 * Lua API: `is_pressed(key)` -> `boolean`
 *
 * The `key` string must match the host's key map, e.g.:
 * - `L_UP` / `L_LEFT` / `L_DOWN` / `L_RIGHT`
 * - `R_UP` / `R_LEFT` / `R_DOWN` / `R_RIGHT`
 *
 * @luaName is_pressed
 * @luaKind function
 * @luaCategory input
 * @luaParam key:string Logical button name (host key map)
 * @luaReturns boolean `true` if pressed, otherwise `false`
 * @luaExample if is_pressed("L_UP") then ... end
 *
 * @param {LuaState} L - Fengari Lua state; key is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_isPressed(L) {
  const key = lua.lua_tojsstring(L, 1);
  const isKeyPressed = Input.isPressed(key);
  lua.lua_pushboolean(L, isKeyPressed);
  return 1;
}

/**
 * Get elapsed runtime in seconds since the script started.
 *
 * Useful for timers, cooldowns, oscillations, and any time-based animation.
 *
 * Lua API: `get_time()` -> `number`
 *
 * @luaName get_time
 * @luaKind function
 * @luaCategory time
 * @luaReturns `number` Seconds (floating point) since the Lua state was created.
 * @luaExample local t = get_time()
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_getTime(L) {
  const time = (performance.now() - L.luaStartTimeMs) / 1000.0; // Convert milliseconds to seconds
  lua.lua_pushnumber(L, time);
  return 1;
}

/**
 * Play a tone at the given frequency for the given duration.
 *
 * Useful for beeps, notifications, and simple audio effects.
 *
 * Lua API: `buzz(frequency, duration)`
 *
 * @luaName buzz
 * @luaKind function
 * @luaCategory sound
 * @luaParam frequency:number frequency in Hz
 * @luaParam duration:number duration in milliseconds (max 30s)
 * @luaReturns nil
 * @luaExample buzz(440, 1000) # Play a 440Hz tone for 1 second
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..2.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_buzz(L) {
  const frequency = lua.lua_tointeger(L, 1);
  const duration = lua.lua_tointeger(L, 2);

  // Play the given frequency for the given duration.
  try {
    Buzzer.buzz(frequency, duration);
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in buzz: " + e));
    lua.lua_error(L);
    return 0;
  }

  return 0;
}

/**
 * Read a complete file at the given path
 *
 * Lua API: `read_file(path)`
 *
 * @luaName read_file
 * @luaKind function
 * @luaCategory file system
 * @luaParam path:string path to the file
 * @luaReturns string: binary string representing the file contents or errors if the file couldn't be found
 * @luaExample local my_file = read_file("/file.bin")
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_readFile(L) {
  const path = lua.lua_tojsstring(L, 1);

  let file;
  try {
    file = FileSystem.readFile(path);
  } catch (error) {
    try {
      file = BuiltinFiles.readFile(path);
    } catch (error) {
      return lauxlib.luaL_error(
        L,
        to_luastring(`failed read file '${path}': ${error.message}`)
      );
    }
  }

  lua.lua_pushlstring(L, file, file.length);

  return 1;
}

/**
 * Read a chunk of data from the file at the given path, offset and size. If the size at the given offset exceeds the file size, only the remaining bytes will be returned.
 *
 * Lua API: `read_file_chunk(path)`
 *
 * @luaName read_file_chunk
 * @luaKind function
 * @luaCategory file system
 * @luaParam path:string path to the file
 * @luaParam offset:int offset since the start of the file in bytes
 * @luaParam size:int size of the chunk to read in bytes
 * @luaReturns string: binary string representing the file contents or nil if the file couldn't be found
 * @luaExample local my_chunk = read_file_chunk("/file.bin", 0, 512) -- reads the 512 first bytes of the file
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_readFileChunk(L) {
  const path = lua.lua_tojsstring(L, 1);
  const offset = lua.lua_tointeger(L, 2);
  const size = lua.lua_tointeger(L, 3);

  let chunk;
  try {
    chunk = FileSystem.readFileChunk(path, offset, size);
  } catch {
    try {
      chunk = BuiltinFiles.readFileChunk(path, offset, size);
    } catch {
      console.warn("Failed to read file chunk");
    }
  }

  // If the chunk couldn't be read, return nil.
  if (!chunk) {
    lua.lua_pushnil(L);
    return 1;
  }

  // Push the chunk to the stack.
  lua.lua_pushlstring(L, chunk, chunk.length);

  return 1;
}

/**
 * Get the size of the file at path
 *
 * Lua API: `file_size(path)`
 *
 * @luaName file_size
 * @luaKind function
 * @luaCategory file system
 * @luaParam path:string path to the file
 * @luaReturns int: size of the file in bytes
 * @luaExample size = file_size("/file.bin")
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_fileSize(L) {
  const path = lua.lua_tojsstring(L, 1);

  let size;
  try {
    size = FileSystem.fileSizeAtPath(path);
  } catch (error) {
    try {
      size = BuiltinFiles.fileSizeAtPath(path);
    } catch {
      return lauxlib.luaL_error(
        L,
        to_luastring(`failed get file size '${path}': ${error.message}`)
      );
    }
  }

  lua.lua_pushinteger(L, size);

  return 1;
}

/**
 * Get a list of the contents of the directory at the given path.
 *
 * Lua API: `list_directory(path)`
 *
 * @luaName list_directory
 * @luaKind function
 * @luaCategory file system
 * @luaParam path:string path to the file
 * @luaReturns table:<string,bool> a table with paths as keys, and a boolean representing if the path is a file (true) or a directory(false)
 * @luaExample local items = list_directory("/my/directory/path")
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_listDirectory(L) {
  const path = lua.lua_tojsstring(L, 1);

  let contents = [];
  try {
    contents = FileExplorer.tree().listDirectory(path);
  } catch (error) {
    return lauxlib.luaL_error(
      L,
      to_luastring(`failed to list directory '${path}': ${error.message}`)
    );
  }

  lua.lua_createtable(L, contents.length, 0);

  for (const node of contents) {
    lua.lua_pushstring(L, to_luastring(node.path));
    lua.lua_pushboolean(L, node.isFile);
    lua.lua_rawset(L, -3);
  }

  return 1;
}

/**
 * Lua callback definitions (only stubs, for documentation generation purposes)
 */

/**
 * Called once after your script is loaded and before the first frame starts.
 *
 * Use this to initialize game state and set up any values that should persist across
 * frames.
 *
 * Lua API: `setup()`
 *
 * @luaName setup
 * @luaKind callback
 * @luaCategory lifecycle
 * @luaReturns nil
 * @luaExample function setup()
 *   clear()
 * end
 */
function lua_callback_setup() {}

/**
 * Called every frame before `draw()`.
 *
 * Use this for simulation/state updates (movement, timers, collisions, input
 * handling). Keep rendering out of `update()` and perform drawing in `draw()`.
 *
 * Lua API: `update(delta_time)` where `delta_time` is seconds since last frame.
 *
 * @luaName update
 * @luaKind callback
 * @luaCategory lifecycle
 * @luaParam delta_time:number Seconds elapsed since the previous frame (float)
 * @luaReturns nil
 * @luaExample function update(delta_time)
 *   -- movement logic
 * end
 */
function lua_callback_update(delta_time) {}

/**
 * Called every frame after `update()`.
 *
 * Use this to write pixels and render the current state for the frame. This
 * function should focus on drawing, while state changes stay in `update()`.
 *
 * Lua API: `draw()`
 *
 * @luaName draw
 * @luaKind callback
 * @luaCategory lifecycle
 * @luaReturns nil
 * @luaExample function draw()
 *   clear()
 *   set_pixel(1, 1, rgb(255, 0, 0))
 * end
 */
function lua_callback_draw() {}

/**
 * Called on every main loop tick (faster than framerate)
 *
 * Use this for specific things which need a higher resolution than the framerate, like for example
 * a music sequencer.
 *
 * Lua API: `process(delta_time)` where `delta_time` is seconds since last frame.
 *
 * @luaName process
 * @luaKind callback
 * @luaCategory lifecycle
 * @luaParam delta_time:number Seconds elapsed since the previous tick (float)
 * @luaReturns nil
 * @luaExample function process(delta_time)
 *   -- stuff
 * end
 */
function lua_callback_process() {}

/**
 * Called when a mapped button transitions from up to down (key press edge).
 *
 * Use this for one-shot actions like firing, toggling, or menu navigation.
 * For "while held" behavior, prefer polling `is_pressed()` inside `update()`.
 *
 * Lua API: `on_press(button_name)` where `button_name` matches the host key map.
 *
 * @luaName on_press
 * @luaKind callback
 * @luaCategory input
 * @luaParam button_name:string Host key map name (e.g. "L_UP")
 * @luaReturns nil
 * @luaExample function on_press(button_name)
 *   if button_name == "L_UP" then
 *     set_pixel(2, 2, rgb(0, 255, 0))
 *   end
 * end
 */
function lua_callback_onPress(button_name) {}

/**
 * Called when a mapped button transitions from down to up (key release edge).
 *
 * Use this for release-driven actions or cleanup that should happen exactly
 * once when a button is released.
 *
 * Lua API: `on_release(button_name)` where `button_name` matches the host key map.
 *
 * @luaName on_release
 * @luaKind callback
 * @luaCategory input
 * @luaParam button_name:string Host key map name (e.g. "L_UP")
 * @luaReturns nil
 * @luaExample function on_release(button_name)
 *   if button_name == "L_UP" then
 *     clear()
 *   end
 * end
 */
function lua_callback_onRelease(button_name) {}
