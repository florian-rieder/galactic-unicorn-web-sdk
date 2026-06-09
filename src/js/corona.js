// Corona effect implementation for the Galactic Coin Flip web SDK.
// Adapted from Loïc Cattani 2012 "Lights" web experiment

export {
  setup,
  draw
};

const opts = {
  pad: 0,
  cell: 0,
  gap: 0,
  x: 0,
  y: 0,
  color: [255, 255, 255],
  size: 0,
  power: 0,
  c1: [],
  c2: [],
  c3: [],
  c4: [],
  c5: [],
};

function setup(pad, cell, gap, x, y, r, g, b, size, power) {
  opts.pad = pad;
  opts.cell = cell;
  opts.gap = gap;
  opts.x = x;
  opts.y = y;
  opts.color[0] = Math.max(r, 40);
  opts.color[1] = Math.max(g, 40);
  opts.color[2] = Math.max(b, 40);
  opts.size = size;
  opts.power = power;
  opts.radius = size / 2;
  opts.falloffRadius = size ** 2 * Math.exp(power) / 2;
  multiplyColor(opts.color, power ** 2, opts.c1);
  multiplyColor(opts.color, power * 0.4, opts.c2);
  multiplyColor(opts.color, Math.min(power * 0.2, 1), opts.c3);
  multiplyColor(opts.color, Math.min(power * 0.1, 0.7), opts.c4);
  multiplyColor(opts.color, Math.min(power * 0.05, 0.4), opts.c5);
}

// Corona effect implementation
function draw(ctx, col, row) {
  const gradient = ctx.createRadialGradient(
    opts.pad + col * (opts.cell + opts.gap) + opts.cell / 2,
    opts.pad + row * (opts.cell + opts.gap) + opts.cell / 2,
    opts.radius,
    opts.pad + col * (opts.cell + opts.gap) + opts.cell / 2,
    opts.pad + row * (opts.cell + opts.gap) + opts.cell / 2,
    opts.falloffRadius
  );
  gradient.addColorStop(0, getColorRGB(opts.c1));
  gradient.addColorStop(0.025, getColorRGB(opts.c2));
  gradient.addColorStop(0.05, getColorRGB(opts.c3));
  gradient.addColorStop(0.1, getColorRGB(opts.c4));
  gradient.addColorStop(0.25, getColorRGB(opts.c5));
  gradient.addColorStop(1, `rgb(0, 0, 0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(
    Math.max(opts.pad + col * (opts.cell + opts.gap) + opts.cell / 2 - opts.falloffRadius, 0),
    Math.max(opts.pad + row * (opts.cell + opts.gap) + opts.cell / 2 - opts.falloffRadius, 0),
    opts.falloffRadius * 2,
    opts.falloffRadius * 2
  );
}

function multiplyColor(sourceColor, factor, targetColor) {
  const f = Math.max(0, factor);
  targetColor[0] = Math.round(Math.min(sourceColor[0] * f, 255));
  targetColor[1] = Math.round(Math.min(sourceColor[1] * f, 255));
  targetColor[2] = Math.round(Math.min(sourceColor[2] * f, 255));
}

function getColorRGB(color) {
  return `rgb(${color.join(',')})`;
}
