// Corona effect implementation for the Galactic Coin Flip web SDK.
// Adapted from Loïc Cattani 2012 "Lights" web experiment

export {
  draw,
};

const COLOR_STEP = 16;
const MAX_CACHE_ITEMS = 96;
const POLLUTION_MIN_NON_BLACK = 28;
const POLLUTION_MAX = 40;
const POLLUTION_R = 0.95;
const POLLUTION_G = 1.0;
const POLLUTION_B = 0.9;
const cache = new Map();

// Reused scratch values for the draw hot path.
let quantizedSize = 0;
let luminance = 0;
let leakFloor = 0;
let qr = 0;
let qg = 0;
let qb = 0;
let key = 0;
let sprite;

function draw(ctx, x, y, r, g, b, size, power = 0) {
  quantizedSize = Math.round(size * 100);

  if ((r | g | b) === 0) {
    // Keep black pixels black even with brightness > 1.
    qr = 0;
    qg = 0;
    qb = 0;
  } else {
    // Preserve the current "washed" glow style while making leakage depend on perceived brightness.
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    leakFloor = POLLUTION_MIN_NON_BLACK +
      (POLLUTION_MAX - POLLUTION_MIN_NON_BLACK) * (luminance / 255);
    qr = quantize(Math.max(r, leakFloor * POLLUTION_R), COLOR_STEP);
    qg = quantize(Math.max(g, leakFloor * POLLUTION_G), COLOR_STEP);
    qb = quantize(Math.max(b, leakFloor * POLLUTION_B), COLOR_STEP);
  }

  key =
    ((((quantizedSize * 64) + power) * 32 + (qr >> 3)) * 32 + (qg >> 3)) * 32 + (qb >> 3);
  sprite = cache.get(key);
  if (!sprite) {
    sprite = buildSprite(qr, qg, qb, size, power);
    cache.set(key, sprite);
    if (cache.size > MAX_CACHE_ITEMS) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  }

  ctx.drawImage(sprite.canvas, x - sprite.falloffRadius, y - sprite.falloffRadius);
}

function buildSprite(r, g, b, size, power) {
  const color = [r, g, b];
  const c1 = [];
  const c2 = [];
  const c3 = [];
  const c4 = [];
  const c5 = [];

  const radius = size / 2;
  const falloffRadius = size * Math.exp(power / 7);
  const dim = Math.ceil(falloffRadius * 2);

  multiplyColor(color, power * 0.7, c1);
  multiplyColor(color, power * 0.5, c2);
  multiplyColor(color, Math.min(power * 2, 2), c3);
  multiplyColor(color, Math.min(power * 1, 0.8), c4);
  multiplyColor(color, Math.min(power * 0.8, 0.5), c5);

  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = dim;
  spriteCanvas.height = dim;

  const spriteCtx = spriteCanvas.getContext("2d");
  const center = falloffRadius;
  const gradient = spriteCtx.createRadialGradient(
    center,
    center,
    radius,
    center,
    center,
    falloffRadius,
  );

  gradient.addColorStop(0, getColorRGB(c1));
  gradient.addColorStop(0.025, getColorRGB(c2));
  gradient.addColorStop(0.05, getColorRGB(c3));
  gradient.addColorStop(0.1, getColorRGB(c4));
  gradient.addColorStop(0.25, getColorRGB(c5));
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  spriteCtx.fillStyle = gradient;
  spriteCtx.fillRect(0, 0, dim, dim);

  return {
    canvas: spriteCanvas,
    falloffRadius,
  };
}

function multiplyColor(sourceColor, factor, targetColor) {
  const f = Math.max(0, factor);
  targetColor[0] = Math.round(Math.min(sourceColor[0] * f, 255));
  targetColor[1] = Math.round(Math.min(sourceColor[1] * f, 255));
  targetColor[2] = Math.round(Math.min(sourceColor[2] * f, 255));
}

function quantize(v, step) {
  return Math.max(0, Math.min(255, Math.round(v / step) * step));
}

function getColorRGB(color) {
  return `rgb(${color.join(',')})`;
}
