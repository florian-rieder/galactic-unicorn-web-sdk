import { Display } from "./display.js";
import { Input } from "./input.js";
import { playBuzzTone } from "./audio.js";
import {
  loadMusic,
  playMusic,
  pauseMusic,
  resumeMusic,
  stopMusic,
  setTempo,
  setTicksPerBeat,
  isMusicPlaying,
} from "./music.js";
import { fileSizeAtPath, readFile, readFileChunk } from "./file-system.js";
import fengari from "./vendor/fengari.js";
import { hslToRgb } from "./color.js";
import { Terminal } from "./terminal.js";

const { lua, lauxlib, lualib, to_luastring } = fengari;

/**
 * List of Lua API functions.
 * @type {Array<{luaName: string, luaFunction: function}>}
 */
const luaApiFunctions = [
  { luaName: "print", luaFunction: lua_print },
  { luaName: "clamp", luaFunction: lua_clamp },
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
  { luaName: "line", luaFunction: lua_line },
  { luaName: "is_pressed", luaFunction: lua_isPressed },
  { luaName: "get_time", luaFunction: lua_getTime },
  //{ luaName: "get_frame", luaFunction: lua_getFrame },
  { luaName: "clear", luaFunction: lua_clear },
  { luaName: "buzz", luaFunction: lua_buzz },
  { luaName: "set_tempo", luaFunction: lua_setTempo },
  { luaName: "set_ticks_per_beat", luaFunction: lua_setTicksPerBeat },
  { luaName: "load_music", luaFunction: lua_loadMusic },
  { luaName: "play_music", luaFunction: lua_playMusic },
  { luaName: "pause_music", luaFunction: lua_pauseMusic },
  { luaName: "resume_music", luaFunction: lua_resumeMusic },
  { luaName: "stop_music", luaFunction: lua_stopMusic },
  { luaName: "is_music_playing", luaFunction: lua_isMusicPlaying },
  { luaName: "read_file", luaFunction: lua_readFile },
  { luaName: "read_file_chunk", luaFunction: lua_readFileChunk },
  { luaName: "file_size", luaFunction: lua_fileSize },
];

/**
 * List of Lua API constants.
 * @type {Array<{name: string, type: string, value: number, description: string}>}
 */
const luaApiConstants = [
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
 *
 * @type {Array<{luaName: string, luaFunction: function}>}
 */
const luaApiCallbacks = [
  { luaName: "setup", luaFunction: lua_callback_setup },
  { luaName: "update", luaFunction: lua_callback_update },
  { luaName: "draw", luaFunction: lua_callback_draw },
  { luaName: "on_press", luaFunction: lua_callback_onPress },
  { luaName: "on_release", luaFunction: lua_callback_onRelease },
];

/**
 * List of dangerous Lua functions. For script sandboxing purposes
 * @type {Array<string>}
 */
const dangerousFunctions = [
  "dofile",
  "loadfile",
  "load",
  "loadstring",
  "collectgarbage",
];

const LUA_EXECUTION_BUDGET_MS = 1000; // Stop Lua execution after this many ms.
const LUA_BUDGET_HOOK_INSTRUCTION_STEP = 1000; // Run the hook every 1000 instructions.

let currentLuaState = null;

/**
 * Lua package searcher function for the virtual filesystem.
 * @see https://www.lua.org/manual/5.3/manual.html#6.3
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_virtualFsPackageSearcher(L) {
  const modulePath = lua.lua_tojsstring(L, 1);

  // TODO: Transform moduleName into host path (?)
  // require("utils") -> current_script_directory/utils.lua
  // require("module.utils") -> current_script_directory/module/utils.lua

  const rawFile = readFile(modulePath);
  if (!rawFile) {
    lua.lua_pushstring(
      L,
      to_luastring(`\n\tno file '${modulePath}' in virtual filesystem`),
    );
    return 1;
  }

  const loadStatus = lauxlib.luaL_loadbuffer(
    L,
    rawFile, // fengari already expects a Uint8Array for strings so we don't need to do anything !
    rawFile.length,
    to_luastring(`@${modulePath}`),
  );
  if (loadStatus !== lua.LUA_OK) {
    const err = lua.lua_tojsstring(L, -1);
    lua.lua_pop(L, 1);
    lua.lua_pushstring(
      L,
      to_luastring(
        `\n\terror loading '${modulePath}' from virtual filesystem:\n\t${err}`,
      ),
    );
    return 1;
  }

  // We return the loaded chunk (luaL_loadbuffer pushes it to the stack) so 1 is the number of return values.
  return 1;
}

/**
 * Register the virtual filesystem package searcher function by overwriting the default
 * package.searchers table with only our own searcher function (defaults won't work).
 *
 * @see https://www.lua.org/manual/5.3/manual.html#6.3
 * @param {LuaState} L - Fengari Lua state.
 */
function registerVirtualFsPackageSearchers(L) {
  lua.lua_getglobal(L, "package");
  // Create a new table for the searchers
  lua.lua_createtable(L, 1, 0);
  // Push the searcher function to the stack.
  lua.lua_pushcfunction(L, lua_virtualFsPackageSearcher);
  // Set the searcher function at index 1 in the searchers table.
  lua.lua_rawseti(L, -2, 1);
  // Set the searchers table as the value of the "searchers" field in the package table.
  lua.lua_setfield(L, -2, "searchers");
  // Pop the package table from the stack.
  lua.lua_pop(L, 1);
}

/**
 * Initialize the Lua session. Create a new Lua state, open the standard Lua libraries,
 * and register SDK functions and constants.
 *
 * @param {LuaState} L - Fengari Lua state.
 */
export function initLua() {
  if (currentLuaState !== null) {
    console.warn("Lua session already initialized. Call closeLua() first.");
    return;
  }

  Terminal.clear();

  // Create a new Lua state
  const L = lauxlib.luaL_newstate();

  // Open the standard Lua libraries. (This loads ALL libraries, including ones we don't
  // want to give the user, like os, io, etc.)
  // See https://www.lua.org/manual/5.3/manual.html#6
  //lualib.luaL_openlibs(L);

  // Load specific standard libraries.
  lauxlib.luaL_requiref(L, to_luastring("_G"), lualib.luaopen_base, 1);
  lua.lua_pop(L, 1);
  lauxlib.luaL_requiref(L, to_luastring("math"), lualib.luaopen_math, 1);
  lua.lua_pop(L, 1);
  lauxlib.luaL_requiref(L, to_luastring("string"), lualib.luaopen_string, 1);
  lua.lua_pop(L, 1);
  lauxlib.luaL_requiref(L, to_luastring("table"), lualib.luaopen_table, 1);
  lua.lua_pop(L, 1);
  lauxlib.luaL_requiref(L, to_luastring("package"), lualib.luaopen_package, 1);
  lua.lua_pop(L, 1);

  // Remove dangerous base functions
  for (const functionName of dangerousFunctions) {
    // Replace the function with nil.
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, to_luastring(functionName));
  }

  // -- Constants registration

  for (const { name, value } of luaApiConstants) {
    // Push the value of the constant to the stack
    lua.lua_pushnumber(L, value);
    // Tell Lua that the value that was just pushed is the global variable `name`.
    // Lua consumes the value from the stack and assigns it to the global variable `name`.
    lua.lua_setglobal(L, to_luastring(name));
  }

  // -- Functions registration

  for (const { luaName, luaFunction } of luaApiFunctions) {
    // Push the function to the Lua stack.
    lua.lua_pushcfunction(L, luaFunction);
    // Lua consumes the function from the stack and assigns it to the global variable `luaName`.
    lua.lua_setglobal(L, to_luastring(luaName));
  }

  // Register the virtual filesystem package searcher function.
  registerVirtualFsPackageSearchers(L);

  // Set the start time of the Lua session.
  // This is used to calculate the elapsed time since the script started.
  L.luaStartTimeMs = performance.now();
  currentLuaState = L;
}

/**
 * Call a Lua global function if it exists.
 *
 * @param {string} name - The name of the function to call.
 * @param {...any} args - The arguments to pass to the function.
 * @returns {string} - "ok" if a function existed and ran successfully, "missing" if the global is not a function, "error" if the function exists but raised an error.
 */
export function luaCallIfExists(name, ...args) {
  if (currentLuaState == null) {
    return "missing_state";
  }

  const L = currentLuaState;

  lua.lua_getglobal(L, to_luastring(name));

  if (!lua.lua_isfunction(L, -1)) {
    lua.lua_pop(L, 1);

    return "missing";
  }

  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] === "string") {
      lua.lua_pushstring(L, to_luastring(args[i]));
    } else if (typeof args[i] === "number") {
      lua.lua_pushnumber(L, args[i]);
    } else if (typeof args[i] === "boolean") {
      lua.lua_pushboolean(L, args[i]);
    } else {
      lua.lua_pushnil(L);
    }
  }

  // Call the function
  const callStatus = luaRunWithExecutionBudget(L, () =>
    lua.lua_pcall(L, args.length, 0, 0),
  );
  if (callStatus != lua.LUA_OK) {
    const errorMessage = lua.lua_tojsstring(L, -1);
    Terminal.printLine(`[Lua error in "${name}"] ${errorMessage}`);
    lua.lua_pop(L, 1); // Pop the error message from the stack
    return "error";
  }

  return "ok";
}

/**
 * Run some Lua code.
 *
 * @param {string} code - The code to run.
 * @param {string} entryPath - The path to the entrypoint file.
 * @returns {boolean} - True if the code ran successfully, false otherwise.
 */
export function runLua(code, entryPath = "/main.lua") {
  // Close the current Lua state if it exists to start fresh.
  if (currentLuaState === null) {
    throw new Error("No Lua session to run code in. Call initLua() first.");
  }

  // Run the code
  const runStatus = luaRunWithExecutionBudget(currentLuaState, () => {
    // Load the code as a buffer so Lua can consider it as a file with a name.
    // (For better error messages)
    lauxlib.luaL_loadbuffer(
      currentLuaState,
      to_luastring(code),
      code.length,
      to_luastring(`@${entryPath}`),
    );
    // Run the code
    return lua.lua_pcall(currentLuaState, 0, 0, 0);
  });
  if (runStatus != lua.LUA_OK) {
    const errorMessage = lua.lua_tojsstring(currentLuaState, -1);
    Terminal.printLine(`[Error] ${errorMessage}`);
    lua.lua_pop(currentLuaState, 1); // Pop the error message from the stack
    return false; // Failed to run the code.
  }

  return true; // Successfully ran the code.
}

/**
 * Run a Lua function with a maximum execution time budget. Used to catch runaway loops in user
 * code.
 *
 * @param {LuaState} L - The Lua state.
 * @param {Function} fn - The function to run.
 * @returns {any} - The result of the function.
 */
function luaRunWithExecutionBudget(L, fn) {
  const startTime = performance.now();

  const hook = () => {
    if (performance.now() - startTime > LUA_EXECUTION_BUDGET_MS) {
      lua.lua_pushstring(
        L,
        to_luastring(
          `Execution timed out after ${LUA_EXECUTION_BUDGET_MS}ms budget`,
        ),
      );
      lua.lua_error(L);
      return 0;
    }
    return 0;
  };

  lua.lua_sethook(L, hook, lua.LUA_MASKCOUNT, LUA_BUDGET_HOOK_INSTRUCTION_STEP);
  try {
    return fn();
  } finally {
    lua.lua_sethook(L, null, 0, 0);
  }
}

/**
 * Close the Lua session.
 * Clean up the Lua state and reset the display buffer.
 */
export function closeLua() {
  // Nothing to close if there is no Lua state.
  if (currentLuaState === null) return;

  lua.lua_close(currentLuaState); // Close the Lua state
  currentLuaState = null; // Clear the current Lua state

  Display.clear(); // Clear the display buffer
  Display.render(); // Render the display
}

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
 * @luaParams messages:variable Lua variables to print
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
 * Clamp a value between a minimum and maximum.
 *
 * Lua API: `clamp(value, min, max)` -> `clamped`
 *
 * @luaName clamp
 * @luaKind function
 * @luaCategory math
 * @luaParams value:number value to clamp
 * @luaParams min:number minimum value
 * @luaParams max:number maximum value
 * @luaReturns `number` clamped value
 * @luaExample local clamped = clamp(10, 0, 20)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..3.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_clamp(L) {
  const value = lua.lua_tonumber(L, 1);
  const min = lua.lua_tonumber(L, 2);
  const max = lua.lua_tonumber(L, 3);
  const clamped = Math.max(min, Math.min(max, value));
  lua.lua_pushnumber(L, clamped);
  return 1;
}

/**
 * Create an RGB color table.
 *
 * Lua API: `rgb(r, g, b)` -> `{r, g, b}`
 *
 * @luaName rgb
 * @luaKind function
 * @luaCategory color
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
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
 * @luaParams h:number hue in degrees (any number, wrapped mod 360)
 * @luaParams s:number saturation (0.0..1.0)
 * @luaParams l:number lightness (0.0..1.0)
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

function readRgbTableArg(L, colorArgIndex) {
  lauxlib.luaL_checktype(L, colorArgIndex, lua.LUA_TTABLE);

  lua.lua_rawgeti(L, colorArgIndex, 1);
  const r = lauxlib.luaL_checkinteger(L, -1);
  lua.lua_pop(L, 1);

  lua.lua_rawgeti(L, colorArgIndex, 2);
  const g = lauxlib.luaL_checkinteger(L, -1);
  lua.lua_pop(L, 1);

  lua.lua_rawgeti(L, colorArgIndex, 3);
  const b = lauxlib.luaL_checkinteger(L, -1);
  lua.lua_pop(L, 1);

  lauxlib.luaL_argcheck(
    L,
    r >= 0 && r <= 255,
    colorArgIndex,
    "r out of range 0..255",
  );
  lauxlib.luaL_argcheck(
    L,
    g >= 0 && g <= 255,
    colorArgIndex,
    "g out of range 0..255",
  );
  lauxlib.luaL_argcheck(
    L,
    b >= 0 && b <= 255,
    colorArgIndex,
    "b out of range 0..255",
  );

  return [r, g, b];
}

function pushRgbTable(L, r, g, b) {
  lua.lua_createtable(L, 3, 0);
  lua.lua_pushinteger(L, r);
  lua.lua_rawseti(L, -2, 1);
  lua.lua_pushinteger(L, g);
  lua.lua_rawseti(L, -2, 2);
  lua.lua_pushinteger(L, b);
  lua.lua_rawseti(L, -2, 3);
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
 * @luaParams x:number integer pixel x coordinate (0-based)
 * @luaParams y:number integer pixel y coordinate (0-based)
 * @luaReturns `table` RGB color table `{r, g, b}`
 * @luaExample set_pixel(0, 0, rgb(42, 0, 134))
 *
 * local my_color = get_pixel(0, 0)
 *
 * print(my_color[1]) # 42
 * print(my_color[2]) # 0
 * print(my_color[3]) # 134
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
 * @luaParams x:number pixel x coordinate (0-based)
 * @luaParams y:number pixel y coordinate (0-based)
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
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
 * @luaParams x:number integer pixel x coordinate (0-based)
 * @luaParams y:number integer pixel y coordinate (0-based)
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaParams alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
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
 * @luaParams x:number subpixel x coordinate (float, 0-based)
 * @luaParams y:number subpixel y coordinate (float, 0-based)
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
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
 * Does nothing in the web version, but available on the hardware.
 *
 * This is useful for setting the brightness of a pixel to a value that different from
 * the default brightness, for short-term effects like flashing.
 * If the total current exceeds the limit, an error checkerboard pattern will be
 * displayed.
 * Use with moderation.
 *
 * Lua API: `set_unsafe_pixel_brightness(x, y, brightness)`
 *
 * @luaName set_unsafe_pixel_brightness
 * @luaKind function
 * @luaCategory display
 * @luaParams x:number pixel x coordinate (0-based)
 * @luaParams y:number pixel y coordinate (0-based)
 * @luaParams brightness:number brightness value (0..9)
 * @luaReturns nil
 * @luaExample set_unsafe_pixel_brightness(3, 2, 5)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..3.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setUnsafePixelBrightness(L) {
  const _x = lua.lua_tointeger(L, 1);
  const _y = lua.lua_tointeger(L, 2);
  const brightness = lua.lua_tonumber(L, 3);

  lauxlib.luaL_argcheck(
    L,
    brightness >= 0 && brightness <= 9,
    3,
    "brightness out of range 0..9",
  );

  // Does nothing in the web version, but available on the hardware.
  // TODO: emulate the error behavior in the web version.

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
 * @luaParams x:number rectangle x coordinate (float, 0-based)
 * @luaParams y:number rectangle y coordinate (float, 0-based)
 * @luaParams w:number rectangle width (float)
 * @luaParams h:number rectangle height (float)
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
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
 * @luaParams x:number rectangle x coordinate (float accepted; floored)
 * @luaParams y:number rectangle y coordinate (float accepted; floored)
 * @luaParams w:number rectangle width (float accepted; floored)
 * @luaParams h:number rectangle height (float accepted; floored)
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
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
 * @luaParams x:number rectangle x coordinate (float, 0-based)
 * @luaParams y:number rectangle y coordinate (float, 0-based)
 * @luaParams w:number rectangle width (float)
 * @luaParams h:number rectangle height (float)
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaParams alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
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
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
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
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaParams alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
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
 * Draw a line between two points.
 *
 * Useful for vectors, separators, debug overlays, and lightweight wireframe
 * style visuals.
 *
 * Lua API: `line(x0, y0, x1, y1, {r, g, b})`
 *
 * @luaName line
 * @luaKind function
 * @luaCategory display
 * @luaParams x0:number integer start x coordinate (0-based)
 * @luaParams y0:number integer start y coordinate (0-based)
 * @luaParams x1:number integer end x coordinate (0-based)
 * @luaParams y1:number integer end y coordinate (0-based)
 * @luaParams rgb_color:table {r, g, b} color table with components in the range 0..255
 * @luaReturns nil
 * @luaExample line(0, 0, SCREEN_W - 1, SCREEN_H - 1, rgb(255, 0, 0))
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..5.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_line(L) {
  const x0 = lua.lua_tointeger(L, 1);
  const y0 = lua.lua_tointeger(L, 2);
  const x1 = lua.lua_tointeger(L, 3);
  const y1 = lua.lua_tointeger(L, 4);
  const [r, g, b] = readRgbTableArg(L, 5);
  Display.drawLine(x0, y0, x1, y1, r, g, b);
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
 * @luaParams key:string Logical button name (host key map)
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
 * @luaParams frequency:number frequency in Hz
 * @luaParams duration:number duration in milliseconds (max 30s)
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
    playBuzzTone(frequency, duration);
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in buzz: " + e));
    lua.lua_error(L);
    return 0;
  }

  return 0;
}

/**
 * Set the tempo of the music.
 *
 * Lua API: `set_tempo(bpm)`
 *
 * @luaName set_tempo
 * @luaKind function
 * @luaCategory sound
 * @luaParams bpm:number Tempo in beats per minute.
 * @luaReturns nil
 * @luaExample set_tempo(120)
 *
 * @param {LuaState} L - Fengari Lua state; bpm is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setTempo(L) {
  const bpm = lua.lua_tointeger(L, 1);
  try {
    setTempo(bpm);
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in set_tempo: " + e));
    lua.lua_error(L);
    return 0;
  }
  return 0;
}

/**
 * Set the number of ticks per beat.
 *
 * Lua API: `set_ticks_per_beat(ticks_per_beat)`
 *
 * @luaName set_ticks_per_beat
 * @luaKind function
 * @luaCategory sound
 * @luaParams ticks_per_beat:number Number of ticks per beat.
 * @luaReturns nil
 * @luaExample set_ticks_per_beat(4)
 *
 * @param {LuaState} L - Fengari Lua state; ticks_per_beat is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setTicksPerBeat(L) {
  const ticks_per_beat = lua.lua_tointeger(L, 1);
  try {
    setTicksPerBeat(ticks_per_beat);
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in set_ticks_per_beat: " + e));
    lua.lua_error(L);
    return 0;
  }
  return 0;
}

/**
 * Load a music string into memory. Must be called before playing music.
 * Music strings are defined in the format "note:duration", where note is a note name
 * and duration is the number of ticks (1/4 note is 1 tick by default).
 * Spaces are used to separate notes.
 * The note "0" is used to represent a rest (silence note).
 *
 * Lua API: `load_music(music_string)`
 *
 * @luaName load_music
 * @luaKind function
 * @luaCategory sound
 * @luaParams music_string:string Music string to load.
 * @luaReturns nil
 * @luaExample load_music("A4:4 0:1 C4:4")
 *
 * @param {LuaState} L - Fengari Lua state; name is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_loadMusic(L) {
  const music_string = lua.lua_tojsstring(L, 1);
  try {
    loadMusic(music_string);
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in load_music: " + e));
    lua.lua_error(L);
    return 0;
  }
  return 0;
}

/**
 * Start or restart playback of the loaded music.
 *
 * Lua API: `play_music(loop)`
 *
 * @luaName play_music
 * @luaKind function
 * @luaCategory sound
 * @luaParams loop:boolean If true, loop when the track ends.
 * @luaReturns nil
 * @luaExample play_music(true)
 *
 * @param {LuaState} L - Fengari Lua state; `loop` is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_playMusic(L) {
  const loop = lua.lua_toboolean(L, 1) || false;
  try {
    playMusic(loop);
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in play_music: " + e));
    lua.lua_error(L);
    return 0;
  }
  return 0;
}

/**
 * Pause music playback (can be resumed).
 *
 * Lua API: `pause_music()`
 *
 * @luaName pause_music
 * @luaKind function
 * @luaCategory sound
 * @luaReturns nil
 * @luaExample pause_music()
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_pauseMusic(L) {
  try {
    pauseMusic();
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in pause_music: " + e));
    lua.lua_error(L);
    return 0;
  }
  return 0;
}

/**
 * Resume music after `pause_music()`.
 *
 * Lua API: `resume_music()`
 *
 * @luaName resume_music
 * @luaKind function
 * @luaCategory sound
 * @luaReturns nil
 * @luaExample resume_music()
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_resumeMusic(L) {
  try {
    resumeMusic();
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in resume_music: " + e));
    lua.lua_error(L);
    return 0;
  }
  return 0;
}

/**
 * Stop music and reset playback state.
 *
 * Lua API: `stop_music()`
 *
 * @luaName stop_music
 * @luaKind function
 * @luaCategory sound
 * @luaReturns nil
 * @luaExample stop_music()
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_stopMusic(L) {
  try {
    stopMusic();
  } catch (e) {
    lua.lua_pushstring(L, to_luastring("in stop_music: " + e));
    lua.lua_error(L);
    return 0;
  }
  return 0;
}

/**
 * Check if music is currently playing.
 *
 * Lua API: `is_music_playing()`
 *
 * @luaName is_music_playing
 * @luaKind function
 * @luaCategory sound
 * @luaReturns boolean `true` if music is playing, otherwise `false`
 * @luaExample if is_music_playing() then ... end
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_isMusicPlaying(L) {
  const isPlaying = isMusicPlaying();
  lua.lua_pushboolean(L, isPlaying);
  return 1;
}

/**
 * Read a complete file at the given path
 *
 * Lua API: `read_file(path)`
 *
 * @luaName read_file
 * @luaKind function
 * @luaCategory file system
 * @luaParams path:string path to the file
 * @luaReturns string binary string representing the file contents or null if the file couldn't be found
 * @luaExample my_file = read_file("/file.bin")
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_readFile(L) {
  const path = lua.lua_tojsstring(L, 1);

  let file = readFile(path);
  if (file === null) {
    lua.lua_pushnil(L);
    return 1;
  }

  lua.lua_pushlstring(L, file, file.length);

  return 1;
}

/**
 * Read a chunk of data from the file at the given path, offset and size
 *
 * Lua API: `read_file_chunk(path)`
 *
 * @luaName read_file_chunk
 * @luaKind function
 * @luaCategory file system
 * @luaParams path:string path to the file
 * @luaParams offset:int offset since the start of the file in bytes
 * @luaParams size:int size of the chunk to read in bytes
 * @luaReturns string binary string representing the file contents or null if the file couldn't be found
 * @luaExample my_file = read_file("/file.bin")
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_readFileChunk(L) {
  const path = lua.lua_tojsstring(L, 1);
  const offset = lua.lua_tointeger(L, 2);
  const size = lua.lua_tointeger(L, 3);

  let chunk = readFileChunk(path, offset, size);

  // If the chunk couldn't be read, return nil.
  if (chunk === null) {
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
 * @luaParams path:string path to the file
 * @luaReturns int: size of the file in bytes
 * @luaExample size = file_size("/file.bin")
 *
 * @param {LuaState} L - Fengari Lua state.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_fileSize(L) {
  const path = lua.lua_tojsstring(L, 1);

  let size = fileSizeAtPath(path);

  lua.lua_pushinteger(L, size);

  return 1;
}

/**
 * Lua callback definitions
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
export function lua_callback_setup() {
  return luaCallIfExists("setup");
}

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
 * @luaParams delta_time:number Seconds elapsed since the previous frame (float)
 * @luaReturns nil
 * @luaExample function update(delta_time)
 *   -- movement logic
 * end
 */
export function lua_callback_update(delta_time) {
  return luaCallIfExists("update", delta_time);
}

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
 *   set_pixel(1, 1, 255, 0, 0)
 * end
 */
export function lua_callback_draw() {
  return luaCallIfExists("draw");
}

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
 * @luaParams button_name:string Host key map name (e.g. "L_UP")
 * @luaReturns nil
 * @luaExample function on_press(button_name)
 *   if button_name == "L_UP" then
 *     set_pixel(2, 2, rgb(0, 255, 0))
 *   end
 * end
 */
export function lua_callback_onPress(button_name) {
  return luaCallIfExists("on_press", button_name);
}

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
 * @luaParams button_name:string Host key map name (e.g. "L_UP")
 * @luaReturns nil
 * @luaExample function on_release(button_name)
 *   if button_name == "L_UP" then
 *     clear()
 *   end
 * end
 */
export function lua_callback_onRelease(button_name) {
  return luaCallIfExists("on_release", button_name);
}
