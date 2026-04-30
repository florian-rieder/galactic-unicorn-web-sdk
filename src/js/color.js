"use strict";

(function initColorUtils(globalObject) {
  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function hueToRgb(p, q, t) {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  }

  function hslToRgb(h, s, l) {
    const hh = (((h % 360) + 360) % 360) / 360;
    const ss = clamp01(s);
    const ll = clamp01(l);

    if (ss === 0) {
      const gray = clampByte(ll * 255);
      return { r: gray, g: gray, b: gray };
    }

    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    return {
      r: clampByte(hueToRgb(p, q, hh + 1 / 3) * 255),
      g: clampByte(hueToRgb(p, q, hh) * 255),
      b: clampByte(hueToRgb(p, q, hh - 1 / 3) * 255),
    };
  }

  function rgbToHsl(r, g, b) {
    const rr = clamp01(r / 255);
    const gg = clamp01(g / 255);
    const bb = clamp01(b / 255);
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      if (max === rr) {
        h = (gg - bb) / d + (gg < bb ? 6 : 0);
      } else if (max === gg) {
        h = (bb - rr) / d + 2;
      } else {
        h = (rr - gg) / d + 4;
      }
      h *= 60;
    }

    return {
      h: Math.round(h),
      s: Number(s.toFixed(3)),
      l: Number(l.toFixed(3)),
    };
  }

  globalObject.ColorUtils = {
    clamp01,
    clampByte,
    hslToRgb,
    rgbToHsl,
  };
})(window);
