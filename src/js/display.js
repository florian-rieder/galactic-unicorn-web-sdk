const canvas = document.getElementById("display");
const ctx = canvas.getContext("2d");

export const SCREEN_W = 20;
export const SCREEN_H = 10;
const CELL = 20;
const GAP = 4;
const PAD = 2;

// Functions to interact with the display write to the buffer instead of the canvas
// The canvas is then rendered at once at the end of the frame from the buffer
const _buffer = new Uint8Array(SCREEN_W * SCREEN_H * 3).fill(0); // 3 bytes per pixel: RGB

// 2*PAD + N*CELL + (N-1)*GAP — ratio is exactly 2:1 when PAD = GAP/2
canvas.width = 2 * PAD + SCREEN_W * CELL + (SCREEN_W - 1) * GAP; // 480
canvas.height = 2 * PAD + SCREEN_H * CELL + (SCREEN_H - 1) * GAP; // 240

// Flush the buffer to canvas
export function render() {
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < SCREEN_H; row++) {
    for (let col = 0; col < SCREEN_W; col++) {
      const r = _buffer[3 * (row * SCREEN_W + col)];
      const g = _buffer[3 * (row * SCREEN_W + col) + 1];
      const b = _buffer[3 * (row * SCREEN_W + col) + 2];

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(
        PAD + col * (CELL + GAP),
        PAD + row * (CELL + GAP),
        CELL,
        CELL,
      );
    }
  }
}

// Clear the buffer to black (0,0,0)
export function clear() {
  // Fill the buffer with black (0,0,0) => clears the display
  _buffer.fill(0);
}

export function getPixel(x, y) {
  const px = Math.floor(x);
  const py = Math.floor(y);

  if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) {
    return;
  }

  return [
    _buffer[3 * (py * SCREEN_W + px)],
    _buffer[3 * (py * SCREEN_W + px) + 1],
    _buffer[3 * (py * SCREEN_W + px) + 2],
  ];
}

// Set a single pixel in the buffer
export function setPixel(x, y, r, g, b) {
  // Convert float coordinates to integer coordinates
  const px = Math.floor(x);
  const py = Math.floor(y);

  if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) {
    return;
  }

  _buffer[3 * (py * SCREEN_W + px)] = r;
  _buffer[3 * (py * SCREEN_W + px) + 1] = g;
  _buffer[3 * (py * SCREEN_W + px) + 2] = b;
}

// Blend a colour over the current pixel value (alpha: 0.0–1.0)
export function setPixelBlend(x, y, r, g, b, alpha) {
  const px = Math.floor(x);
  const py = Math.floor(y);

  if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) {
    return;
  }

  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const i = 3 * (py * SCREEN_W + px);
  const inv = 1 - clampedAlpha;

  // Blend the color with the existing color in the buffer.
  _buffer[i] = Math.round(_buffer[i] * inv + r * clampedAlpha);
  _buffer[i + 1] = Math.round(_buffer[i + 1] * inv + g * clampedAlpha);
  _buffer[i + 2] = Math.round(_buffer[i + 2] * inv + b * clampedAlpha);
}

// Subpixel point: bilinear distribution across up to 4 neighbouring LEDs.
// x, y are float coordinates; brightness is spread proportionally to the covered area
// of the pixel.
export function setPixelF(x, y, r, g, b) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const fx = x - px;
  const fy = y - py;
  setPixelBlend(px, py, r, g, b, (1 - fx) * (1 - fy));
  setPixelBlend(px + 1, py, r, g, b, fx * (1 - fy));
  setPixelBlend(px, py + 1, r, g, b, (1 - fx) * fy);
  setPixelBlend(px + 1, py + 1, r, g, b, fx * fy);
}

// Draw a rectangle in the buffer
export function rect(x, y, w, h, r, g, b) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const pw = Math.floor(w);
  const ph = Math.floor(h);
  for (let i = 0; i < pw; i++) {
    for (let j = 0; j < ph; j++) {
      setPixel(px + i, py + j, r, g, b);
    }
  }
}

// Blend a rectangle in the buffer
export function rectBlend(x, y, w, h, r, g, b, alpha) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const pw = Math.floor(w);
  const ph = Math.floor(h);
  for (let i = 0; i < pw; i++) {
    for (let j = 0; j < ph; j++) {
      setPixelBlend(px + i, py + j, r, g, b, alpha);
    }
  }
}

// Anti-aliased filled rectangle at float coordinates.
// Each LED cell gets brightness proportional to its overlap with the rect.
export function rectF(fx, fy, fw, fh, r, g, b) {
  const x1 = fx + fw;
  const y1 = fy + fh;
  for (let py = Math.floor(fy); py < Math.ceil(y1); py++) {
    for (let px = Math.floor(fx); px < Math.ceil(x1); px++) {
      const cx = Math.min(x1, px + 1) - Math.max(fx, px);
      const cy = Math.min(y1, py + 1) - Math.max(fy, py);
      setPixelBlend(px, py, r, g, b, cx * cy);
    }
  }
}

// Fill the buffer with a color
export function fill(r, g, b) {
  // Here we need to loop through each pixel in the buffer and set it to the color.
  // I don't think we can use a single pass like clear because r,g,b are different values.
  for (let x = 0; x < SCREEN_W; x++) {
    for (let y = 0; y < SCREEN_H; y++) {
      setPixel(x, y, r, g, b);
    }
  }
}

// Fill the buffer in transparency over the existing colors in the buffer.
export function fillBlend(r, g, b, alpha) {
  for (let x = 0; x < SCREEN_W; x++) {
    for (let y = 0; y < SCREEN_H; y++) {
      setPixelBlend(x, y, r, g, b, alpha);
    }
  }
}

// Draw a line in the buffer
export function drawLine(x0, y0, x1, y1, r, g, b) {
  // Bresenham's line algorithm
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);

  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;

  let err = dx - dy;

  while (true) {
    setPixel(x0, y0, r, g, b);

    if (x0 === x1 && y0 === y1) break;

    let e2 = 2 * err;

    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }

    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Fit the canvas to the display wrapper
const displayWrapper = document.getElementById("display-wrapper");
const displayRatio = canvas.width / canvas.height;

function fitCanvas() {
  const ww = displayWrapper.clientWidth;
  const wh = displayWrapper.clientHeight;
  if (ww / wh > displayRatio) {
    canvas.style.height = wh + "px";
    canvas.style.width = wh * displayRatio + "px";
  } else {
    canvas.style.width = ww + "px";
    canvas.style.height = ww / displayRatio + "px";
  }
}

new ResizeObserver(fitCanvas).observe(displayWrapper);
