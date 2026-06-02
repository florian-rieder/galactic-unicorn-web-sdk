/**
 * Set up the base sandboxed Lua environment
 */

import fengari from "./vendor/fengari.js";
const { lua, lauxlib, lualib, to_luastring } = fengari;

import { FileSystem } from "./file-system.js"

/**
 * List of Lua standard libraries to open with their associated opener function name
 * @type {Record<string, string>}
 */
const LUA_SAFE_STANDARD_LIBRARIES = {
  "_G": "luaopen_base",
  "math": "luaopen_math",
  "string": "luaopen_string",
  "table": "luaopen_table",
  "package": "luaopen_package",
  "coroutine": "luaopen_coroutine",
  "utf8": "luaopen_utf8",
};

/**
 * List of dangerous Lua functions. For script sandboxing purposes
 * @type {Array<string>}
 */
const DANGEROUS_FUNCTIONS = [
  "dofile",
  "loadfile",
  "load",
  "loadstring",
  "collectgarbage",
];


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

  const rawFile = FileSystem.readFile(modulePath);
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
 * Open a new Lua state with safe standard libraries and overwritten package.searchers
 * 
 * @returns {LuaState} L - Fengari Lua state
 */
export function openSandboxedLuaVM() {
  // Create a new Lua state
  const L = lauxlib.luaL_newstate();

  // Open the standard Lua libraries. (This loads ALL libraries, including ones we don't
  // want to give the user, like os, io, etc.)
  // See https://www.lua.org/manual/5.3/manual.html#6
  //lualib.luaL_openlibs(L);

  // Better: load specific standard libraries.
  for (const [libName, libOpener] of Object.entries(LUA_SAFE_STANDARD_LIBRARIES)) {
    lauxlib.luaL_requiref(L, to_luastring(libName), lualib[libOpener], 1);
    lua.lua_pop(L, 1);
  }

  // Remove dangerous base functions
  for (const functionName of DANGEROUS_FUNCTIONS) {
    // Replace the function with nil.
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, to_luastring(functionName));
  }

  // Register the virtual filesystem package searcher function.
  registerVirtualFsPackageSearchers(L)

  return L
}
