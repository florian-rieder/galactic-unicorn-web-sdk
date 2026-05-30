/**
 * Input
 */

const keysPressed = new Set();

/**
 * Map of keyboard events to button names.
 * @type {Record<string, string>}
 */
export const KEY_MAP = Object.freeze({
  w: "L_UP",
  a: "L_LEFT",
  s: "L_DOWN",
  d: "L_RIGHT",
  ArrowUp: "R_UP",
  ArrowLeft: "R_LEFT",
  ArrowDown: "R_DOWN",
  ArrowRight: "R_RIGHT",
  q: "L_BUMP",
  e: "R_BUMP",
  1: "MENU",
  2: "ESC",
});

export const Input = Object.freeze({
  /**
   * Drop all held keys (call when starting a run so missed keyup cannot stick input).
   */
  clearPressedKeys() {
    keysPressed.clear();
  },

  /**
   * Mark a key as pressed.
   * @param {string} key - The name of the button to mark as pressed.
   */
  markPressed(key) {
    keysPressed.add(key);
  },

  /**
   * Mark a key as released.
   * @param {string} key - The name of the button to mark as released.
   */
  markReleased(key) {
    keysPressed.delete(key);
  },

  /**
   * Check if a button is currently pressed.
   * @param {string} key - The name of the button to check.
   * @returns {boolean} True if the button is pressed, false otherwise.
   */
  isPressed(key) {
    return keysPressed.has(key);
  },
});
