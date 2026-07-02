/**
 * Input
 */

const keysPressed = new Map();

/**
 * Map of keyboard events to button names.
 * @type {Record<string, string>}
 */
const KEY_MAP = {
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
};

// Input repeat
let repeatDelay = 0.25;
let repeatInterval = 0.1;

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
    keysPressed.set(key, {
      firstPressed: performance.now(),
      lastRepeat: null,
    });
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
    return keysPressed.get(key) !== undefined;
  },

  /**
   * Process repeat keys
   * @param {Function} callback
   */
  processRepeat(callback) {
    for (const [key, val] of keysPressed) {
      const now = performance.now();
      if (!val.lastRepeat) {
        // First repeat
        if (now - val.firstPressed >= repeatDelay * 1000) {
          val.lastRepeat = now;
          callback(key);
        }
      } else {
        // Repeat repeats
        if (now - val.lastRepeat >= repeatInterval * 1000) {
          val.lastRepeat = now;
          callback(key);
        }
      }
    }
  },

  /**
   * Set the repeat delay
   * @param {number} delay in seconds
   */
  setRepeatDelay(delay) {
    repeatDelay = delay;
  },

  /**
   * Set the repeat interval
   * @param {number} interval in seconds
   */
  setRepeatInterval(interval) {
    repeatInterval = interval;
  },

  /**
   * Get the Galactic Unicorn name of a key from an event key.
   * @param {string} eventKey - The key to get the name of.
   * @returns {string} The name of the key.
   */
  getKeyName(eventKey) {
    return KEY_MAP[eventKey];
  },
});
