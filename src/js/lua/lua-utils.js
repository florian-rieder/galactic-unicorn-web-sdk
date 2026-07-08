/**
 * Helper functions for Lua stack operations
 */

import fengari from "../vendor/fengari.js";
const { lua, lauxlib, to_luastring } = fengari;

/**
 * Format a Lua stack value to a string through its `tostring()` implementation
 *
 * @param {LuaState} L - Fengari Lua state.
 * @param {number} index - Stack index of the value to format.
 * @returns {string} Formatted value.
 */
export function formatLuaValue(L, index) {
  lua.lua_getglobal(L, to_luastring("tostring"));
  lua.lua_pushvalue(L, index);

  if (lua.lua_pcall(L, 1, 1, 0) === lua.LUA_OK) {
    const formatted = lua.lua_tojsstring(L, -1);
    lua.lua_pop(L, 1); // Pop tostring from the stack
    return formatted;
  }

  const errorMessage = lua.lua_tojsstring(L, -1);
  lua.lua_pop(L, 1);
  return `<error: ${errorMessage}>`;
}

/**
 * Reads a color table from the Lua stack and returns an array of [r, g, b] values.
 *
 * @param {LuaState} L - Fengari Lua state
 * @param {number} colorArgIndex - Index of the color table on the Lua stack.
 * @returns {[number, number, number]} [r, g, b] values.
 */
export function readRgbTableArg(L, colorArgIndex) {
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
    "r out of range 0..255"
  );
  lauxlib.luaL_argcheck(
    L,
    g >= 0 && g <= 255,
    colorArgIndex,
    "g out of range 0..255"
  );
  lauxlib.luaL_argcheck(
    L,
    b >= 0 && b <= 255,
    colorArgIndex,
    "b out of range 0..255"
  );

  return [r, g, b];
}

/**
 * Pushes an RGB color table onto the Lua stack.
 *
 * @param {LuaState} L - Fengari Lua state
 * @param {number} r - Red value
 * @param {number} g - Green value
 * @param {number} b - Blue value
 */
export function pushRgbTable(L, r, g, b) {
  lua.lua_createtable(L, 3, 0);
  lua.lua_pushinteger(L, r);
  lua.lua_rawseti(L, -2, 1);
  lua.lua_pushinteger(L, g);
  lua.lua_rawseti(L, -2, 2);
  lua.lua_pushinteger(L, b);
  lua.lua_rawseti(L, -2, 3);
}
