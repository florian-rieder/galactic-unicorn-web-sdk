/**
 * Monaco color swatches for SDK `rgb()` / `hsl()` calls.
 *
 * Monaco's color provider API is two hooks:
 * - provideDocumentColors: find color literals and their document ranges
 * - provideColorPresentations: when user edits a swatch, rewrite the source text
 *
 * Color values passed to Monaco must be 0..1 floats, not 0..255.
 */
import * as monaco from "./custom-monaco.js";
import { clampByte, hslToRgb, rgbToHsl } from "../color.js";

const RGB_CALL_PATTERN =
  /\brgb\s*\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/g;

const HSL_CALL_PATTERN =
  /\bhsl\s*\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/g;

/**
 * Find `rgb(...)` / `hsl(...)` calls so Monaco can show color pickers in the editor.
 *
 * @param {import("monaco-editor").editor.ITextModel} model
 * @returns {import("monaco-editor").languages.IColorInformation[]}
 */
function findDocumentColors(model) {
  const text = model.getValue();
  const infos = [];

  let match;
  RGB_CALL_PATTERN.lastIndex = 0;
  while ((match = RGB_CALL_PATTERN.exec(text)) !== null) {
    const r = clampByte(Number(match[1]));
    const g = clampByte(Number(match[2]));
    const b = clampByte(Number(match[3]));
    const start = model.getPositionAt(match.index);
    const end = model.getPositionAt(match.index + match[0].length);
    infos.push({
      color: { red: r / 255, green: g / 255, blue: b / 255, alpha: 1 },
      range: new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column,
      ),
    });
  }

  HSL_CALL_PATTERN.lastIndex = 0;
  while ((match = HSL_CALL_PATTERN.exec(text)) !== null) {
    const h = Number(match[1]);
    const s = Number(match[2]);
    const l = Number(match[3]);
    const rgb = hslToRgb(h, s, l);
    const start = model.getPositionAt(match.index);
    const end = model.getPositionAt(match.index + match[0].length);
    infos.push({
      color: {
        red: rgb.r / 255,
        green: rgb.g / 255,
        blue: rgb.b / 255,
        alpha: 1,
      },
      range: new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column,
      ),
    });
  }

  return infos;
}

/**
 * When the user picks a color, offer both `rgb(...)` and `hsl(...)` text edits.
 *
 * @param {import("monaco-editor").editor.ITextModel} model
 * @param {import("monaco-editor").languages.IColorInformation} colorInfo
 */
function provideColorPresentations(model, colorInfo) {
  const source = model.getValueInRange(colorInfo.range);
  const r = clampByte(colorInfo.color.red * 255);
  const g = clampByte(colorInfo.color.green * 255);
  const b = clampByte(colorInfo.color.blue * 255);
  const hsl = rgbToHsl(r, g, b);

  const rgbLabel = `rgb(${r}, ${g}, ${b})`;
  const hslLabel = `hsl(${hsl.h}, ${hsl.s}, ${hsl.l})`;
  const rgbPresentation = {
    label: rgbLabel,
    textEdit: { range: colorInfo.range, text: rgbLabel },
  };
  const hslPresentation = {
    label: hslLabel,
    textEdit: { range: colorInfo.range, text: hslLabel },
  };

  if (/^\s*hsl\s*\(/.test(source)) {
    return [hslPresentation, rgbPresentation];
  }
  return [rgbPresentation, hslPresentation];
}

/**
 * Register color picker support for `rgb()` / `hsl()` in Lua buffers.
 */
export function registerLuaColorProvider() {
  monaco.languages.registerColorProvider("lua", {
    provideDocumentColors: findDocumentColors,
    provideColorPresentations,
  });
}
