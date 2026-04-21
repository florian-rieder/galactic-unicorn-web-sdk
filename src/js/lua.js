import {
  clear,
  render,
  getPixel,
  setPixel,
  setPixelBlend,
  setPixelF,
  rect,
  rectBlend,
  rectF,
  fill,
  fillBlend,
  drawLine,
  SCREEN_W,
  SCREEN_H,
} from "./display.js";
import { isPressed } from "./input.js";
const { lua, lauxlib, lualib, to_luastring } = fengari;

/**
 * List of Lua API functions.
 * @type {Array<{luaName: string, luaFunction: function}>}
 */
const luaApiFunctions = [
  { luaName: "print", luaFunction: lua_print },
  { luaName: "get_pixel", luaFunction: lua_getPixel },
  { luaName: "set_pixel", luaFunction: lua_setPixel },
  { luaName: "set_pixel_blend", luaFunction: lua_setPixelBlend },
  { luaName: "set_pixel_f", luaFunction: lua_setPixelF },
  { luaName: "rect", luaFunction: lua_rect },
  { luaName: "rect_blend", luaFunction: lua_rectBlend },
  { luaName: "rect_f", luaFunction: lua_rectF },
  { luaName: "fill", luaFunction: lua_fill },
  { luaName: "fill_blend", luaFunction: lua_fillBlend },
  { luaName: "line", luaFunction: lua_line },
  // { luaName: "random", luaFunction: lua_random },
  { luaName: "is_pressed", luaFunction: lua_isPressed },
  { luaName: "get_time", luaFunction: lua_getTime },
  //{ luaName: "get_frame", luaFunction: lua_getFrame },
  { luaName: "clear", luaFunction: lua_clear },
];

/**
 * List of Lua API constants.
 * @type {Array<{name: string, type: string, value: number, description: string}>}
 */
const luaApiConstants = [
  {
    name: "SCREEN_W",
    type: "number",
    value: 20, // Dirty hardcoding but display resolution isn't likely to change.
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
 * List of Lua lifecycle callbacks. For documentation purposes only.
 *
 * Note: these callbacks are implemented by the user in Lua and are invoked by the host
 * via `luaCallIfExists("callback_name", ...)`. They are not registered as Lua globals
 * from JavaScript.
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
  "require",
  "load",
  "loadstring",
  "collectgarbage",
];

const LUA_EXECUTION_BUDGET_MS = 20; // Stop Lua execution after 20ms.
const LUA_BUDGET_HOOK_INSTRUCTION_STEP = 1000; // Run the hook every 1000 instructions.

let currentLuaState = null;

const consoleOutput = document.getElementById("console-output");

export function initLua() {
  if (currentLuaState !== null) {
    console.warn("Lua session already initialized. Call closeLua() first.");
    return;
  }

  consoleOutput.textContent = ""; // Clear the console

  // Create a new Lua state
  const L = lauxlib.luaL_newstate();

  // Open the standard Lua libraries. (This loads ALL libraries, including ones we don't
  // want to give the user, like os, io, etc.)
  // See https://www.lua.org/manual/5.3/manual.html#6
  //lualib.luaL_openlibs(L);

  // Load specific standard libraries.
  lauxlib.luaL_requiref(L, to_luastring("_G"), lualib.luaopen_base, 1);
  lua.lua_pop(L, 1);

  // Remove dangerous base functions
  for (const functionName of dangerousFunctions) {
    // Replace the function with nil.
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, to_luastring(functionName));
  }

  lauxlib.luaL_requiref(L, to_luastring("math"), lualib.luaopen_math, 1);
  lua.lua_pop(L, 1);
  lauxlib.luaL_requiref(L, to_luastring("string"), lualib.luaopen_string, 1);
  lua.lua_pop(L, 1);
  lauxlib.luaL_requiref(L, to_luastring("table"), lualib.luaopen_table, 1);
  lua.lua_pop(L, 1);

  L.luaStartTimeMs = performance.now();

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

  currentLuaState = L;
}

// Call a Lua global function if it exists.
// Returns:
// - "ok" if a function existed and ran successfully
// - "missing" if the global is not a function
// - "error" if the function exists but raised an error
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
    consoleOutput.textContent += `[Lua error in "${name}"] ${errorMessage}\n`;
    lua.lua_pop(L, 1); // Pop the error message from the stack
    return "error";
  }

  return "ok";
}

// Run some Lua code.
export function runLua(code) {
  // Close the current Lua state if it exists to start fresh.
  if (currentLuaState === null) {
    throw new Error("No Lua session to run code in. Call initLua() first.");
  }

  // Run the code
  const runStatus = luaRunWithExecutionBudget(currentLuaState, () =>
    lauxlib.luaL_dostring(currentLuaState, to_luastring(code)),
  );
  if (runStatus != lua.LUA_OK) {
    const errorMessage = lua.lua_tojsstring(currentLuaState, -1);
    consoleOutput.textContent += `[Error] ${errorMessage}\n`;
    lua.lua_pop(currentLuaState, 1); // Pop the error message from the stack
    return false; // Failed to run the code.
  }

  return true; // Successfully ran the code.
}

/**
 * Run a Lua function with a maximum execution time budget.
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

// Close the Lua session.
export function closeLua() {
  // Nothing to close if there is no Lua state.
  if (currentLuaState === null) return;

  lua.lua_close(currentLuaState); // Close the Lua state
  currentLuaState = null; // Clear the current Lua state

  clear(); // Clear the display buffer
  render(); // Render the display
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
 * (This replaces the default Lua `print` for the session.)
 *
 * @luaName print
 * @luaKind function
 * @luaCategory console
 * @luaParams message:string Message to print (first argument is stringified).
 * @luaReturns nil
 * @luaExample print("Hello, world!")
 *
 * @param {LuaState} L - Fengari Lua state; message is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_print(L) {
  const message = lua.lua_tojsstring(L, 1);
  consoleOutput.textContent += message + "\n";
  return 0; // Return 0 results to Lua
}

/**
 * Read the current color of one pixel.
 *
 * Useful for effects that react to what is already drawn (sampling, simple
 * collision checks against color, post-processing tricks, etc.).
 *
 * Lua API: `get_pixel(x, y)` → `r, g, b`
 *
 * @luaName get_pixel
 * @luaKind function
 * @luaCategory display
 * @luaParams x:number integer pixel x coordinate (0-based)
 * @luaParams y:number integer pixel y coordinate (0-based)
 * @luaReturns r:number, g:number, b:number
 * @luaExample local r, g, b = get_pixel(3, 2)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..2.
 * @returns {number} Number of values pushed to Lua (always 3).
 */
function lua_getPixel(L) {
  const x = lua.lua_tointeger(L, 1);
  const y = lua.lua_tointeger(L, 2);
  let pixel = getPixel(x, y);
  if (pixel === undefined) {
    pixel = [0, 0, 0]; // Default to black if the pixel is out of bounds.
  }
  lua.lua_pushnumber(L, pixel[0]);
  lua.lua_pushnumber(L, pixel[1]);
  lua.lua_pushnumber(L, pixel[2]);
  return 3;
}

/**
 * Set one pixel to an RGB color.
 *
 * This is the most direct drawing primitive: great for point effects, particles,
 * and any algorithm that draws pixel-by-pixel.
 *
 * Lua API: `set_pixel(x, y, r, g, b)`
 *
 * @luaName set_pixel
 * @luaKind function
 * @luaCategory display
 * @luaParams x:number pixel x coordinate (0-based)
 * @luaParams y:number pixel y coordinate (0-based)
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaReturns nil
 * @luaExample set_pixel(3, 2, 255, 0, 0)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..5.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setPixel(L) {
  const x = lua.lua_tointeger(L, 1);
  const y = lua.lua_tointeger(L, 2);
  const r = lua.lua_tointeger(L, 3);
  const g = lua.lua_tointeger(L, 4);
  const b = lua.lua_tointeger(L, 5);
  setPixel(x, y, r, g, b);
  return 0;
}

/**
 * Blend a color onto one pixel instead of replacing it.
 *
 * Use this for transparency and softer visuals (trails, fades, glow-like overlays) by mixing
 * with the color that is already on screen.
 *
 * Lua API: `set_pixel_blend(x, y, r, g, b, alpha)`
 *
 * @luaName set_pixel_blend
 * @luaKind function
 * @luaCategory display
 * @luaParams x:number integer pixel x coordinate (0-based)
 * @luaParams y:number integer pixel y coordinate (0-based)
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaParams alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
 * @luaReturns nil
 * @luaExample set_pixel_blend(3, 2, 255, 0, 0, 0.5)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..6.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setPixelBlend(L) {
  const x = lua.lua_tointeger(L, 1);
  const y = lua.lua_tointeger(L, 2);
  const r = lua.lua_tointeger(L, 3);
  const g = lua.lua_tointeger(L, 4);
  const b = lua.lua_tointeger(L, 5);
  const alpha = lua.lua_tonumber(L, 6);
  setPixelBlend(x, y, r, g, b, alpha);
  return 0;
}

/**
 * Draw a point using floating-point coordinates.
 *
 * This is useful when positions come from smooth/physics movement and you do
 * not want to round everything to integer coordinates yourself.
 *
 * Lua API: `set_pixel_f(x, y, r, g, b)`
 *
 * @luaName set_pixel_f
 * @luaKind function
 * @luaCategory display
 * @luaParams x:number subpixel x coordinate (float, 0-based)
 * @luaParams y:number subpixel y coordinate (float, 0-based)
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaReturns nil
 * @luaExample set_pixel_f(3.25, 2.75, 0, 255, 0)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..5.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_setPixelF(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const r = lua.lua_tointeger(L, 3);
  const g = lua.lua_tointeger(L, 4);
  const b = lua.lua_tointeger(L, 5);
  setPixelF(x, y, r, g, b);
  return 0;
}

/**
 * Draw a rectangle using floating-point coordinates.
 *
 * Good for smooth movement/animation where object positions are not always on
 * exact integer pixel boundaries.
 *
 * Lua API: `rect_f(x, y, w, h, r, g, b)`
 *
 * @luaName rect_f
 * @luaKind function
 * @luaCategory display
 * @luaParams x:number rectangle x coordinate (float, 0-based)
 * @luaParams y:number rectangle y coordinate (float, 0-based)
 * @luaParams w:number rectangle width (float)
 * @luaParams h:number rectangle height (float)
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaReturns nil
 * @luaExample rect_f(1.2, 1.2, 5.5, 3.5, 0, 0, 255)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..7.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_rectF(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const w = lua.lua_tonumber(L, 3);
  const h = lua.lua_tonumber(L, 4);
  const r = lua.lua_tointeger(L, 5);
  const g = lua.lua_tointeger(L, 6);
  const b = lua.lua_tointeger(L, 7);
  rectF(x, y, w, h, r, g, b);
  return 0;
}

/**
 * Draw a filled axis-aligned rectangle.
 *
 * Great for UI blocks, paddles, bars, and simple game objects.
 *
 * Lua API: `rect(x, y, w, h, r, g, b)`
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
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaReturns nil
 * @luaExample rect(1, 1, 5, 3, 255, 255, 255)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..7.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_rect(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const w = lua.lua_tonumber(L, 3);
  const h = lua.lua_tonumber(L, 4);
  const r = lua.lua_tointeger(L, 5);
  const g = lua.lua_tointeger(L, 6);
  const b = lua.lua_tointeger(L, 7);
  rect(x, y, w, h, r, g, b);
  return 0;
}

/**
 * Blend a filled rectangle with what is already on screen.
 *
 * Useful for overlays, tint zones, and soft UI panels.
 *
 * @luaName rect_blend
 * @luaKind function
 * @luaCategory display
 * @luaParams x:number rectangle x coordinate (float, 0-based)
 * @luaParams y:number rectangle y coordinate (float, 0-based)
 * @luaParams w:number rectangle width (float)
 * @luaParams h:number rectangle height (float)
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaParams alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
 * @luaReturns nil
 * @luaExample rect_blend(0, 0, SCREEN_W, SCREEN_H, 255, 0, 0, 0.5)

 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..8.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_rectBlend(L) {
  const x = lua.lua_tonumber(L, 1);
  const y = lua.lua_tonumber(L, 2);
  const w = lua.lua_tonumber(L, 3);
  const h = lua.lua_tonumber(L, 4);
  const r = lua.lua_tointeger(L, 5);
  const g = lua.lua_tointeger(L, 6);
  const b = lua.lua_tointeger(L, 7);
  const alpha = lua.lua_tonumber(L, 8);
  rectBlend(x, y, w, h, r, g, b, alpha);
  return 0;
}

/**
 * Fill the entire screen with one color.
 *
 * Most scripts call this at the start of `draw()` to clear the previous frame
 * and paint a background color in one call.
 *
 * Lua API: `fill(r, g, b)`
 *
 * @luaName fill
 * @luaKind function
 * @luaCategory display
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaReturns nil
 * @luaExample fill(255, 0, 0)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..3.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_fill(L) {
  const r = lua.lua_tointeger(L, 1);
  const g = lua.lua_tointeger(L, 2);
  const b = lua.lua_tointeger(L, 3);
  fill(r, g, b);
  return 0;
}

/**
 * Blend one color over the whole screen.
 *
 * This keeps existing pixels visible while tinting the frame, which is useful
 * for fades, flashes, and mood/color shifts.
 *
 * Lua API: `fill_blend(r, g, b, alpha)`
 *
 * @luaName fill_blend
 * @luaKind function
 * @luaCategory display
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaParams alpha:number blend amount in range `0.0..1.0` (0=keep old, 1=replace)
 * @luaReturns nil
 * @luaExample fill_blend(255, 0, 0, 0.5)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..4.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_fillBlend(L) {
  const r = lua.lua_tointeger(L, 1);
  const g = lua.lua_tointeger(L, 2);
  const b = lua.lua_tointeger(L, 3);
  const alpha = lua.lua_tonumber(L, 4);
  fillBlend(r, g, b, alpha);
  return 0;
}

/**
 * Draw a line between two points.
 *
 * Useful for vectors, separators, debug overlays, and lightweight wireframe
 * style visuals.
 *
 * Lua API: `line(x0, y0, x1, y1, r, g, b)`
 *
 * @luaName line
 * @luaKind function
 * @luaCategory display
 * @luaParams x0:number integer start x coordinate (0-based)
 * @luaParams y0:number integer start y coordinate (0-based)
 * @luaParams x1:number integer end x coordinate (0-based)
 * @luaParams y1:number integer end y coordinate (0-based)
 * @luaParams r:number red channel (0-255)
 * @luaParams g:number green channel (0-255)
 * @luaParams b:number blue channel (0-255)
 * @luaReturns nil
 * @luaExample line(0, 0, SCREEN_W - 1, SCREEN_H - 1, 255, 0, 0)
 *
 * @param {LuaState} L - Fengari Lua state; args are read from stack indexes 1..7.
 * @returns {number} Number of values returned to Lua (always 0).
 */
function lua_line(L) {
  const x0 = lua.lua_tointeger(L, 1);
  const y0 = lua.lua_tointeger(L, 2);
  const x1 = lua.lua_tointeger(L, 3);
  const y1 = lua.lua_tointeger(L, 4);
  const r = lua.lua_tointeger(L, 5);
  const g = lua.lua_tointeger(L, 6);
  const b = lua.lua_tointeger(L, 7);
  drawLine(x0, y0, x1, y1, r, g, b);
  return 0;
}

// Already provided by the math standard library !
// But maybe we want to use our own RNG ?
// And make it the same between the emulator and the actual hardware ?
// Maybe with a set_random_seed function as well ?
// function lua_random(L) {
//   let min = lua.lua_tointeger(L, 1);
//   let max = lua.lua_tointeger(L, 2);
//   if (min > max) [max, min] = [min, max]; // Quite self-explanatory, no ? Swap the two values if min is greater than max.
//   // Generate a random integer between min and max inclusive.
//   const random = Math.floor(Math.random() * (max - min + 1)) + min;
//   lua.lua_pushnumber(L, random);
//   return 1;
// }

/**
 * Check whether a mapped button is currently held down.
 *
 * Use this inside `update()` for continuous input (movement while a key is
 * held), as opposed to one-shot input events from `on_press`/`on_release`.
 *
 * Lua API: `is_pressed(key)` → `boolean`
 *
 * The `key` string must match the host's key map, e.g.:
 * - `LEFT_UP` / `LEFT_LEFT` / `LEFT_DOWN` / `LEFT_RIGHT`
 * - `RIGHT_UP` / `RIGHT_LEFT` / `RIGHT_DOWN` / `RIGHT_RIGHT`
 *
 * @luaName is_pressed
 * @luaKind function
 * @luaCategory input
 * @luaParams key:string Logical button name (host key map)
 * @luaReturns boolean `true` if pressed, otherwise `false`
 * @luaExample if is_pressed("LEFT_UP") then ... end
 *
 * @param {LuaState} L - Fengari Lua state; key is read from stack index 1.
 * @returns {number} Number of values returned to Lua (always 1).
 */
function lua_isPressed(L) {
  const key = lua.lua_tojsstring(L, 1);
  const isKeyPressed = isPressed(key);
  lua.lua_pushboolean(L, isKeyPressed);
  return 1;
}

/**
 * Get elapsed runtime in seconds since the script started.
 *
 * Useful for timers, cooldowns, oscillations, and any time-based animation.
 *
 * Lua API: `get_time()` → `number`
 *
 * @luaName get_time
 * @luaKind function
 * @luaCategory time
 * @luaReturns number Seconds (floating point) since the Lua state was created.
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

// function lua_getFrame(L) {
//   const frame = 0; // How to get the number of frames from main.js ? call a function in main.js ?
//   lua.lua_pushnumber(L, frame);
//   return 1;
// }

/**
 * Clear the screen to black (`0, 0, 0`).
 *
 * Equivalent to `fill(0, 0, 0)` and commonly used at the start of `draw()`.
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
  clear();
  return 0;
}

// Callbacks, for documentation purposes only. We define dummy js functions just so that
// the documentation generator can find them.

/**
 * Called once after your script is loaded and before the first frame starts.
 *
 * Use this to initialize game state, clear/fill the screen, and set up any
 * values that should persist across frames.
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
 * @luaParams delta_time:number Seconds elapsed since the previous frame (float)
 * @luaReturns nil
 * @luaExample function update(delta_time)
 *   -- movement logic
 * end
 */
function lua_callback_update() {}

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
function lua_callback_draw() {}

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
 * @luaCategory lifecycle
 * @luaParams button_name:string Host key map name (e.g. "LEFT_UP")
 * @luaReturns nil
 * @luaExample function on_press(button_name)
 *   if button_name == "LEFT_UP" then
 *     set_pixel(2, 2, 0, 255, 0)
 *   end
 * end
 */
function lua_callback_onPress() {}

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
 * @luaCategory lifecycle
 * @luaParams button_name:string Host key map name (e.g. "LEFT_UP")
 * @luaReturns nil
 * @luaExample function on_release(button_name)
 *   if button_name == "LEFT_UP" then
 *     clear()
 *   end
 * end
 */
function lua_callback_onRelease() {}
