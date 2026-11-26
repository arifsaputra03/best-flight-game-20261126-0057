// Golden Hour — Gullwing Bay: the terrain, the water, the town and the ring course.
// One analytic height function shapes everything, so the mesh the pilot sees is the
// ground the flight model collides with. West and south fall away into the bay; the
// north-east rises into the Saffron Hills; Port Saffron town grids the east shore
// plain; the airfield plateau sits flat above the south fields.

import { FIELD_HEIGHT, RUNWAY, SEA_LEVEL, WORLD_SIZE } from './config.js';
import { clamp, fbmNoise, lerp, makeRandom, smoothstep } from './random.js';

const HALF = WORLD_SIZE / 2;

/** Rolling lowland plus a mountain mass, before the coast and the flattening. */
function rawHeight(x, z) {
  let h = 6 + fbmNoise(x, z, 760, 4, 1103) * 34;
  const dm = Math.hypot(x - 2400, z + 2400);
  const mountain = smoothstep(1 - dm / 2150);
  h += Math.pow(mountain, 1.6) * (290 + fbmNoise(x, z, 520, 4, 2207) * 170);
  const dm2 = Math.hypot(x - 300, z + 2750);
  const ridge = smoothstep(1 - dm2 / 1500);
  h += Math.pow(ridge, 1.8) * (120 + fbmNoise(x, z, 430, 3, 3311) * 80);
  return h;
}

/** How far west the bay's shoreline sits at this z: a wavy line down the map. */
function shoreX(z) {
  return -1250 + (fbmNoise(0, z, 900, 3, 4409) - 0.5) * 840;
}

/** How far south the bay's northern shore sits at this x. */
function shoreZ(x) {
  return 1750 + (fbmNoise(x, 0, 850, 3, 5513) - 0.5) * 760;
}

/** Distance outside a rounded rectangle centred at (cx, cz); 0 inside it. */
function roundedRectDistance(x, z, cx, cz, halfX, halfZ, radius) {
  const dx = Math.max(Math.abs(x - cx) - (halfX - radius), 0);
  const dz = Math.max(Math.abs(z - cz) - (halfZ - radius), 0);
  return Math.hypot(dx, dz) - 0; // feather measured from the rect's edge band
}

/** The ground height in metres at (x, z). Water sits at SEA_LEVEL where this is lower. */
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  // The bay: sink the land west of the shoreline and south of the inlet's shore.
  const westness = smoothstep((shoreX(z) - x) / 520 + 0.5);
  h = lerp(h, -14, westness);
  const southFade = clamp((900 - x) / 800, 0, 1);
  const southness = smoothstep((z - shoreZ(x)) / 470 + 0.5) * southFade;
  h = lerp(h, -12, southness);
  // Port Saffron's plain: flatten a disc for the town grid.
  const dc = Math.hypot(x - CITY.x, z - CITY.z);
  h = lerp(CITY.height, h, smoothstep((dc - CITY.radius) / 330 + 0.5));
  // The airfield plateau: flatten a rounded rectangle around the runway. The flat
  // part (half extents 640 x 180) covers the whole strip with room to spare.
  const da = roundedRectDistance(x, z, RUNWAY.x, RUNWAY.z, 880, 420, 240);
  h = lerp(FIELD_HEIGHT, h, smoothstep(da / 300));
  // Keep the whole island inside the world square.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h = lerp(h, -10, smoothstep((edge - (HALF - 260)) / 240));
  return h;
}

/** True where the bay covers the ground at (x, z). */
export function isWaterAt(x, z) {
  return heightAt(x, z) < SEA_LEVEL;
}

/** True while (x, z) is over the runway strip itself. */
export function onRunwayAt(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.length / 2 && Math.abs(z - RUNWAY.z) <= RUNWAY.width / 2;
}

/** The town: centre, the height of its plain and the disc it flattens. */
export const CITY = { x: 1350, z: -1050, height: 13, radius: 470 };

/**
 * Port Saffron's buildings: a street grid of boxes, taller toward the middle.
 * Each entry is { x, z, w, d, h, tone } with tone a warm shade in [0, 1).
 */
export const BUILDINGS = buildCity();

function buildCity() {
  const random = makeRandom(90210);
  const buildings = [];
  const street = 96;
  for (let gx = -4; gx <= 4; gx += 1) {
    for (let gz = -4; gz <= 4; gz += 1) {
      if (random() < 0.14) continue; // a square, a car park, a gap
      const cx = CITY.x + gx * street + (random() - 0.5) * 14;
      const cz = CITY.z + gz * street + (random() - 0.5) * 14;
      const centrePull = 1 - Math.min(1, Math.hypot(gx, gz) / 5.2);
      const h = 16 + random() * 22 + centrePull * centrePull * 58;
      buildings.push({
        x: cx,
        z: cz,
        w: 34 + random() * 22,
        d: 34 + random() * 22,
        h,
        tone: random(),
      });
    }
  }
  return buildings;
}

/** The six gates of the ring course, in the order a sortie flies them. */
export const RINGS = [
  { x: 950, y: 80, z: 620 }, // climb-out gate, straight ahead of the runway
  { x: 2050, y: 145, z: -150 }, // over the east fields
  { x: 1400, y: 125, z: -1050 }, // over Port Saffron's rooftops
  { x: -500, y: 110, z: -1550 }, // across the north shore
  { x: -1750, y: 88, z: 150 }, // out over the bay
  { x: -760, y: 40, z: 620 }, // the arrival gate, lined up with the runway
];

/** A ring's radius in metres: fly through the circle it draws. */
export const RING_RADIUS = 26;

// Each gate faces the pilot arriving from the previous gate (or from the runway):
// `facing` is the unit direction of travel as the course reaches that ring.
{
  const courseStart = { x: -430, y: 40, z: RUNWAY.z };
  for (let i = 0; i < RINGS.length; i += 1) {
    const from = i === 0 ? courseStart : RINGS[i - 1];
    const ring = RINGS[i];
    const dx = ring.x - from.x;
    const dy = ring.y - from.y;
    const dz = ring.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    ring.facing = { x: dx / len, y: dy / len, z: dz / len };
  }
}

/** Cloud puffs for the renderer: { x, y, z, scale } scattered over the bay. */
export const CLOUDS = buildClouds();

function buildClouds() {
  const random = makeRandom(4242);
  const clouds = [];
  for (let i = 0; i < 44; i += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 500 + random() * 2500;
    clouds.push({
      x: Math.cos(angle) * distance,
      y: 250 + random() * 190,
      z: Math.sin(angle) * distance,
      scale: 90 + random() * 150,
    });
  }
  return clouds;
}
