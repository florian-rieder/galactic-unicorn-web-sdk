/**
 * Default numeric values for `rgb()` / `hsl()` completion snippets.
 *
 * Snippets use real numbers so Monaco's color swatch appears immediately
 * (see lua-color-provider.js). Override `DEFAULT_SNIPPET_RGB` to change the
 * canonical default color everywhere.
 */
import { rgbToHsl } from "../color.js";

/** @type {[number, number, number]} RGB channels (0..255) for snippet defaults. */
export const DEFAULT_SNIPPET_RGB = [255, 0, 0];

/**
 * @param {[number, number, number]} rgb
 * @returns {[number, number, number]}
 */
function hslDefaultsFromRgb(rgb) {
  const { h, s, l } = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return [h, s, l];
}

/**
 * Per-function snippet placeholders, aligned with each function's `@luaParams`.
 *
 * @type {Record<string, number[]>}
 */
export const COLOR_SNIPPET_DEFAULTS = {
  rgb: [...DEFAULT_SNIPPET_RGB],
  hsl: hslDefaultsFromRgb(DEFAULT_SNIPPET_RGB),
};
