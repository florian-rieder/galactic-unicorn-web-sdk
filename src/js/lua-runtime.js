/**
 * Lua host runtime / session management.
 *
 * Holds the active VM state and exposes the `Lua` namespace used by `main.js`
 * to init, run scripts, invoke lifecycle callbacks, and tear down sessions.
 */

import fengari from "./vendor/fengari.js";
const { lua, lauxlib, to_luastring } = fengari;

import { Display } from "./display.js";
import { Terminal } from "./terminal.js";
import { openLuaVM } from "./lua-environment.js";

const LUA_EXECUTION_BUDGET_MS = 1000; // Stop Lua execution after N ms.
const LUA_BUDGET_HOOK_INSTRUCTION_STEP = 1000; // Run the hook every N instructions.

let g_luaState = null;

export const Lua = Object.freeze({
  /**
   * Initialize the Lua session. Create a new Lua state, open the standard Lua libraries,
   * and register SDK functions and constants.
   */
  init() {
    if (g_luaState !== null) {
      console.warn("Lua session already initialized. Call Lua.close() first.");
      return;
    }

    Terminal.clear();

    g_luaState = openLuaVM();
  },

  /**
   * Call a Lua global function if it exists.
   *
   * @param {string} name - The name of the function to call.
   * @param {...any} args - The arguments to pass to the function.
   * @returns {string} - "ok" if a function existed and ran successfully, "missing" if the global is not a function, "error" if the function exists but raised an error.
   */
  callIfExists(functionName, ...args) {
    if (g_luaState == null) {
      return "missing_state";
    }

    const L = g_luaState;

    lua.lua_getglobal(L, to_luastring(functionName));

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
      Terminal.printLine(`[Lua error in "${functionName}"] ${errorMessage}`);
      lua.lua_pop(L, 1); // Pop the error message from the stack
      return "error";
    }

    return "ok";
  },

  /**
   * Load and run some Lua code.
   *
   * @param {string} code - The code to run.
   * @param {string} entryPath - The path to the entrypoint file.
   * @returns {boolean} - True if the code ran successfully, false otherwise.
   */
  run(code, entryPath) {
    // Close the current Lua state if it exists to start fresh.
    if (g_luaState === null) {
      throw new Error("No Lua session to run code in. Call Lua.init() first.");
    }

    // Run the code
    const runStatus = luaRunWithExecutionBudget(g_luaState, () => {
      // Load the code as a buffer so Lua can consider it as a file with a name.
      // (For better error messages)
      lauxlib.luaL_loadbuffer(
        g_luaState,
        to_luastring(code),
        code.length,
        to_luastring(`@${entryPath}`),
      );
      // Run the code
      return lua.lua_pcall(g_luaState, 0, 0, 0);
    });
    if (runStatus != lua.LUA_OK) {
      const errorMessage = lua.lua_tojsstring(g_luaState, -1);
      Terminal.printLine(`[Error] ${errorMessage}`);
      lua.lua_pop(g_luaState, 1); // Pop the error message from the stack
      return false; // Failed to run the code.
    }

    return true; // Successfully ran the code.
  },

  /**
   * Close the Lua session.
   * Clean up the Lua state and reset the display buffer.
   */
  close() {
    // Nothing to close if there is no Lua state.
    if (g_luaState === null) return;

    lua.lua_close(g_luaState); // Close the Lua state
    g_luaState = null; // Clear the current Lua state

    Display.clear(); // Clear the display buffer
    Display.render(); // Render the display
  },
});

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
