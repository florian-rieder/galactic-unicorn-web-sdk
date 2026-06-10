import * as corona from "./corona.js";

const canvas = document.getElementById("display");
const ctx = canvas.getContext("2d");

const SCREEN_W = 20;
const SCREEN_H = 10;
const CELL = 20;
const GAP = 4;
const PAD = Math.floor(GAP / 2);

// 0-31 5-bit default brightness value
const BR_BASE = 224; // 0b11100000, the base value for brightness (0-31) in the 8-bit brightness byte
const defaultBrightnessValue = BR_BASE + 1; // This should less than 9 !
const maxBrightnessValue = BR_BASE + 11;

// Functions to interact with the display write to the buffer instead of the canvas
// The canvas is then rendered at once at the end of the frame from the buffer
const buffer = new Uint8Array(SCREEN_W * SCREEN_H * 4).fill(0); // 4 bytes per pixel: RGB + brightness

// 2*PAD + N*CELL + (N-1)*GAP gives a nice ratio of 2:1 when PAD = GAP/2, which is exactly the display ratio.
canvas.width = 2 * PAD + SCREEN_W * CELL + (SCREEN_W - 1) * GAP; // 480
canvas.height = 2 * PAD + SCREEN_H * CELL + (SCREEN_H - 1) * GAP; // 240

// Fit the canvas to the display wrapper
const displayWrapper = document.getElementById("display-wrapper");
const displayRatio = canvas.width / canvas.height;

/**
 * Fit the canvas to the display wrapper.
 */
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

export const Display = Object.freeze({
  /**
   * Flush the buffer to the canvas.
   */
  render() {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const stride = CELL + GAP;

    ctx.globalCompositeOperation = "lighter";
    for (let row = 0; row < SCREEN_H; row++) {
      const y = PAD + row * stride;
      for (let col = 0; col < SCREEN_W; col++) {
        const x = PAD + col * stride;
        const i = 4 * (row * SCREEN_W + col);
        const r = buffer[i];
        const g = buffer[i + 1];
        const b = buffer[i + 2];
        const brightness = buffer[i + 3];

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, CELL, CELL);

        // Draw corona effect for brightness above the default value
        if (brightness > defaultBrightnessValue) {
          corona.draw(
            ctx,
            x + CELL / 2,
            y + CELL / 2,
            r,
            g,
            b,
            CELL, // Size
            (brightness - BR_BASE), // 5-bit power value
          );
        }
      }
    }
  },

  /**
   * Clear the buffer to black (0,0,0)
   */
  clear() {
    // Fill the buffer with black (0,0,0) => clears the display
    buffer.fill(0);
  },

  /**
   * Get the color of a pixel in the buffer.
   *
   * @param {number} x - The x coordinate of the pixel.
   * @param {number} y - The y coordinate of the pixel.
   * @returns {Array<number>} The color of the pixel as an array of [r, g, b].
   */
  getPixel(x, y) {
    const px = Math.floor(x);
    const py = Math.floor(y);

    if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) {
      return;
    }

    return [
      buffer[4 * (py * SCREEN_W + px)],
      buffer[4 * (py * SCREEN_W + px) + 1],
      buffer[4 * (py * SCREEN_W + px) + 2],
    ];
  },

  /**
   * Set a single pixel in the buffer.
   *
   * @param {number} x - The x coordinate of the pixel.
   * @param {number} y - The y coordinate of the pixel.
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   */
  setPixel(x, y, r, g, b) {
    // Convert float coordinates to integer coordinates
    const px = Math.floor(x);
    const py = Math.floor(y);

    if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) {
      return;
    }

    buffer[4 * (py * SCREEN_W + px)] = r;
    buffer[4 * (py * SCREEN_W + px) + 1] = g;
    buffer[4 * (py * SCREEN_W + px) + 2] = b;
    buffer[4 * (py * SCREEN_W + px) + 3] = defaultBrightnessValue; // Set brightness to max when setting a pixel
  },

  /**
   * Blend a colour over the current pixel value (alpha: 0.0–1.0)
   *
   * @param {number} x - The x coordinate of the pixel.
   * @param {number} y - The y coordinate of the pixel.
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   * @param {number} alpha - The alpha value of the color.
   */
  setPixelBlend(x, y, r, g, b, alpha) {
    const px = Math.floor(x);
    const py = Math.floor(y);

    if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) {
      return;
    }

    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    const i = 4 * (py * SCREEN_W + px);
    const inv = 1 - clampedAlpha;

    // Blend the color with the existing color in the buffer.
    buffer[i] = Math.round(buffer[i] * inv + r * clampedAlpha);
    buffer[i + 1] = Math.round(buffer[i + 1] * inv + g * clampedAlpha);
    buffer[i + 2] = Math.round(buffer[i + 2] * inv + b * clampedAlpha);
  },

  /**
   * Subpixel point: bilinear distribution across up to 4 neighbouring LEDs.
   *
   * Brightness is spread proportionally to the covered area of the pixel.
   *
   * @param {number} x - The x float coordinate of the pixel.
   * @param {number} y - The y float coordinate of the pixel.
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   */
  setPixelF(x, y, r, g, b) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const fx = x - px;
    const fy = y - py;
    this.setPixelBlend(px, py, r, g, b, (1 - fx) * (1 - fy));
    this.setPixelBlend(px + 1, py, r, g, b, fx * (1 - fy));
    this.setPixelBlend(px, py + 1, r, g, b, (1 - fx) * fy);
    this.setPixelBlend(px + 1, py + 1, r, g, b, fx * fy);
  },

  setUnsafePixelBrightness(x, y, brightness) {
    const px = Math.floor(x);
    const py = Math.floor(y);

    if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) {
      return;
    }

    const i = 4 * (py * SCREEN_W + px) + 3; // The brightness is stored in the 4th byte of each pixel in the buffer
    buffer[i] = Math.min(BR_BASE + brightness, maxBrightnessValue);
  },

  /**
   * Draw a rectangle in the buffer.
   *
   * @param {number} x - The x coordinate of the rectangle.
   * @param {number} y - The y coordinate of the rectangle.
   * @param {number} w - The width of the rectangle.
   * @param {number} h - The height of the rectangle.
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   */
  rect(x, y, w, h, r, g, b) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const pw = Math.floor(w);
    const ph = Math.floor(h);
    for (let i = 0; i < pw; i++) {
      for (let j = 0; j < ph; j++) {
        this.setPixel(px + i, py + j, r, g, b);
      }
    }
  },

  /**
   * Blend a rectangle in the buffer.
   *
   * @param {number} x - The x coordinate of the rectangle.
   * @param {number} y - The y coordinate of the rectangle.
   * @param {number} w - The width of the rectangle.
   * @param {number} h - The height of the rectangle.
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   * @param {number} alpha - The alpha value of the color.
   */
  rectBlend(x, y, w, h, r, g, b, alpha) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const pw = Math.floor(w);
    const ph = Math.floor(h);
    for (let i = 0; i < pw; i++) {
      for (let j = 0; j < ph; j++) {
        this.setPixelBlend(px + i, py + j, r, g, b, alpha);
      }
    }
  },

  /**
   * Anti-aliased filled rectangle at float coordinates.
   *
   * Each LED cell gets brightness proportional to its overlap with the rect.
   *
   * @param {number} fx - The x float coordinate of the rectangle.
   * @param {number} fy - The y float coordinate of the rectangle.
   * @param {number} fw - The float width of the rectangle.
   * @param {number} fh - The float height of the rectangle.
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   */
  rectF(fx, fy, fw, fh, r, g, b) {
    const x1 = fx + fw;
    const y1 = fy + fh;
    for (let py = Math.floor(fy); py < Math.ceil(y1); py++) {
      for (let px = Math.floor(fx); px < Math.ceil(x1); px++) {
        const cx = Math.min(x1, px + 1) - Math.max(fx, px);
        const cy = Math.min(y1, py + 1) - Math.max(fy, py);
        this.setPixelBlend(px, py, r, g, b, cx * cy);
      }
    }
  },

  /**
   * Fill the buffer with a color.
   *
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   */
  fill(r, g, b) {
    // Here we need to loop through each pixel in the buffer and set it to the color.
    // I don't think we can use a single pass like clear because r,g,b are different values.
    for (let x = 0; x < SCREEN_W; x++) {
      for (let y = 0; y < SCREEN_H; y++) {
        this.setPixel(x, y, r, g, b);
      }
    }
  },

  /**
   * Fill the buffer in transparency over the existing colors in the buffer.
   *
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   * @param {number} alpha - The alpha value of the color.
   */
  fillBlend(r, g, b, alpha) {
    for (let x = 0; x < SCREEN_W; x++) {
      for (let y = 0; y < SCREEN_H; y++) {
        this.setPixelBlend(x, y, r, g, b, alpha);
      }
    }
  },

  /**
   * Draw a line in the buffer.
   *
   * @param {number} x0 - The x coordinate of the start of the line.
   * @param {number} y0 - The y coordinate of the start of the line.
   * @param {number} x1 - The x coordinate of the end of the line.
   * @param {number} y1 - The y coordinate of the end of the line.
   * @param {number} r - The red component of the color.
   * @param {number} g - The green component of the color.
   * @param {number} b - The blue component of the color.
   */
  drawLine(x0, y0, x1, y1, r, g, b) {
    // Bresenham's line algorithm
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);

    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;

    let err = dx - dy;

    while (true) {
      this.setPixel(x0, y0, r, g, b);

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
  },
});
