/**
 * Lua host runtime / session management.
 *
 * Holds the active VM state and exposes the `Lua` namespace used by `main.js`
 * to init, run scripts, invoke lifecycle callbacks, and tear down sessions.
 */

import fengari from "../vendor/fengari.js";
const { lua, lauxlib, to_luastring } = fengari;

import { Display } from "../display.js";
import { Terminal } from "../terminal.js";
import { openLuaVM } from "./lua-environment.js";
import { formatLuaValue } from "./lua-utils.js";

const LUA_EXECUTION_BUDGET_MS = 1000; // Stop Lua execution after N ms.
const LUA_BUDGET_HOOK_INSTRUCTION_STEP = 1000; // Run the hook every N instructions.
const REPL_IDENTIFIER = "stdin"; // The official Lua interpreter uses "stdin"

let g_luaState = null;

export const Lua = Object.freeze({
  /**
   * Initialize the Lua session. Create a new Lua state, open the standard Lua libraries,
   * and register SDK functions and constants.
   */
  init() {
    if (this.hasSession()) {
      console.warn("Lua session already initialized. Call Lua.close() first.");
      return;
    }

    Terminal.clear();

    g_luaState = openLuaVM();
  },

  /**
   * Check whether Lua has been initialized
   *
   * @returns {boolean} whether a Lua state is in session
   */
  hasSession() {
    return g_luaState !== null;
  },

  /**
   * Call a Lua global function if it exists.
   *
   * @param {string} functionName - The name of the function to call.
   * @param {...any} args - The arguments to pass to the function (any type is allowed) .
   * @returns {"ok"|"missing"|"missing_state"|"error"} `ok` if a function existed and ran successfully, `missing` if the global is not a function, `missing_state` if there is no Lua state, `error` if the function exists but raised an error.
   */
  callIfExists(functionName, ...args) {
    if (!this.hasSession()) {
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
    const callStatus = runWithExecutionBudget(L, () =>
      lua.lua_pcall(L, args.length, 0, 0)
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
   * Start a fresh Lua state to load and run some Lua code in.
   *
   * @param {string} script - The Lua script to run.
   * @param {string} entryPath - The path to the entrypoint file.
   * @returns {boolean} - True if the code ran successfully, false otherwise.
   */
  run(script, entryPath) {
    // Close the current Lua state if it exists to start fresh.
    if (!this.hasSession()) {
      throw new Error("No Lua session to run code in. Call Lua.init() first.");
    }

    // Run the code
    const runStatus = runWithExecutionBudget(g_luaState, () => {
      // Load the code as a buffer so Lua can consider it as a file with a name.
      // (For better error messages)
      lauxlib.luaL_loadbuffer(
        g_luaState,
        to_luastring(script),
        script.length,
        to_luastring(`@${entryPath}`)
      );
      // Run the code
      return lua.lua_pcall(g_luaState, 0, 0, 0);
    });
    if (runStatus != lua.LUA_OK) {
      const errorMessage = lua.lua_tojsstring(g_luaState, -1);
      Terminal.printLine(errorMessage);
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
    if (!this.hasSession()) return;

    lua.lua_close(g_luaState); // Close the Lua state
    g_luaState = null; // Clear the current Lua state

    Display.clear(); // Clear the display buffer
    Display.render(); // Render the display
  },

  /**
   * Evaluate a Lua expression in the current Lua state.
   *
   * @param {string} expression - The expression to evaluate.
   * @returns {Array<string>|null} The result of the evaluation or null if the expression failed to evaluate.
   */
  eval(expression) {
    if (!this.hasSession()) {
      throw new Error(
        "No Lua session to evaluate code in. Call Lua.init() first."
      );
    }

    return runWithExecutionBudget(g_luaState, () => {
      // First, try prepending a return statement to the expression, so it returns values to us
      const expressionWithReturnBuffer = to_luastring(`return ${expression}`);
      const statusWithReturn = lauxlib.luaL_loadbuffer(
        g_luaState,
        expressionWithReturnBuffer,
        expressionWithReturnBuffer.length,
        to_luastring(`=${REPL_IDENTIFIER}`)
      );

      if (statusWithReturn != lua.LUA_OK) {
        lua.lua_pop(g_luaState, 1); // Discard the error message from the stack

        // Load failed, let's retry without the return
        const expressionBuffer = to_luastring(expression);
        const statusWithoutReturn = lauxlib.luaL_loadbuffer(
          g_luaState,
          expressionBuffer,
          expressionBuffer.length,
          to_luastring(`=${REPL_IDENTIFIER}`)
        );
        if (statusWithoutReturn != lua.LUA_OK) {
          const errorMessage = lua.lua_tojsstring(g_luaState, -1);
          Terminal.printLine(errorMessage);
          lua.lua_pop(g_luaState, 1); // Pop the error message from the stack
          return null; // Failed to evaluate the expression.
        }
      }

      // Call the loaded buffer
      const status = lua.lua_pcall(g_luaState, 0, lua.LUA_MULTRET, 0);
      if (status != lua.LUA_OK) {
        const errorMessage = lua.lua_tojsstring(g_luaState, -1);
        Terminal.printLine(errorMessage);
        lua.lua_pop(g_luaState, 1); // Pop the error message from the stack
        return null; // Failed to evaluate the expression.
      }

      const results = [];

      // How many results were returned (most of the time 0 or 1, but can be more)
      const nresults = lua.lua_gettop(g_luaState);

      for (let i = 1; i <= nresults; i++) {
        const result = formatLuaValue(g_luaState, i);
        results.push(result);
      }

      // Pop all the results from the stack at once, after we've read them (otherwise we'd mess up
      // the stack and get unexpected results)
      lua.lua_pop(g_luaState, nresults);

      Display.render(); // Render any changes to the buffer

      return results;
    });
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
function runWithExecutionBudget(L, fn) {
  const startTime = performance.now();

  const hook = () => {
    if (performance.now() - startTime > LUA_EXECUTION_BUDGET_MS) {
      lua.lua_pushstring(
        L,
        to_luastring(
          `Execution timed out after ${LUA_EXECUTION_BUDGET_MS}ms budget`
        )
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
