/**
 * Helper functions for Lua stack operations
 */

import fengari from "../vendor/fengari.js";
const { lua, lauxlib } = fengari;

/**
 * Reads a color table from the Lua stack and returns an array of [r, g, b] values.
 *
 * @param {LuaState} L - Fengari Lua state
 * @param {number} colorArgIndex - Index of the color table on the Lua stack.
 * @returns {Array<number>} Array of [r, g, b] values.
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
 * @returns {number} Number of values returned to Lua (always 1).
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
