// Golden Hour — a small seeded random source and value noise.
// The terrain, the fields and the city all grow from one seed, so the bay looks the
// same on every visit and in every screenshot.

/** mulberry32: a tiny deterministic PRNG. Returns a function giving floats in [0, 1). */
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a pair of integer cell coordinates to a stable float in [0, 1). */
function hashCell(ix, iz, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (ix * 374761393), 668265263);
  h = Math.imul(h ^ (iz * 2246822519), 3266489917);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise at (x, z) for the given cell size, in [0, 1). */
export function valueNoise(x, z, cellSize, seed) {
  const fx = x / cellSize;
  const fz = z / cellSize;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hashCell(ix, iz, seed);
  const b = hashCell(ix + 1, iz, seed);
  const c = hashCell(ix, iz + 1, seed);
  const d = hashCell(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Fractal noise: a few octaves of value noise summed, roughly in [0, 1). */
export function fbmNoise(x, z, baseCellSize, octaves, seed) {
  let sum = 0;
  let weight = 0.5;
  let total = 0;
  let cell = baseCellSize;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x, z, cell, seed + i * 101) * weight;
    total += weight;
    weight *= 0.5;
    cell *= 0.5;
  }
  return sum / total;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b by t in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep easing of t in [0, 1], flat at both ends. */
export function smoothstep(t) {
  const x = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  return x * x * (3 - 2 * x);
}
