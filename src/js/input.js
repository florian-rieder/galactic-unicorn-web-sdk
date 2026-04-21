import { luaCallIfExists } from "./lua.js";

// Map of keyboard events to button names
export const keyMap = {
  w: "LEFT_UP",
  a: "LEFT_LEFT",
  s: "LEFT_DOWN",
  d: "LEFT_RIGHT",
  ArrowUp: "RIGHT_UP",
  ArrowLeft: "RIGHT_LEFT",
  ArrowDown: "RIGHT_DOWN",
  ArrowRight: "RIGHT_RIGHT",
  q: "LEFT_TRIGGER",
  e: "RIGHT_TRIGGER",
  Enter: "MENU",
  Escape: "ESCAPE",
};

const keysPressed = new Set();

/** Drop all held keys (call when starting a run so missed keyup cannot stick input). */
export function clearPressedKeys() {
  keysPressed.clear();
}

window.addEventListener("blur", () => {
  keysPressed.clear();
});

window.addEventListener("keydown", (event) => {
  // If the key corresponds to a button on the device, signal lua the button has been pressed.
  if (keyMap[event.key]) {
    keysPressed.add(keyMap[event.key]);
    luaCallIfExists("on_press", keyMap[event.key]);
  }
});

window.addEventListener("keyup", (event) => {
  // If the key corresponds to a button on the device, signal lua the button has been released.
  if (keyMap[event.key]) {
    keysPressed.delete(keyMap[event.key]);
    luaCallIfExists("on_release", keyMap[event.key]);
  }
});

export function isPressed(key) {
  return keysPressed.has(key);
}
