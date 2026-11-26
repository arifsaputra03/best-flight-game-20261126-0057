// Golden Hour — the Kestrel KH-1, built from boxes and frusta.
// A cream-and-red high-wing tourer with a glass canopy, a spinning propeller (its own
// geometry, so it can whirl) and a separate landing gear (so it can fold away).
// Local axes: nose toward -z, up +y, right wing +x; the origin is the centre of
// gravity and the wheels' undersides sit at GEAR_BOTTOM.

import { GeometryBuilder } from './geometry.js';

export const CREAM = [0.93, 0.86, 0.72];
export const RED = [0.76, 0.15, 0.11];
export const GLASS = [0.09, 0.15, 0.19];
export const METAL = [0.22, 0.21, 0.2];
export const TYRE = [0.07, 0.07, 0.08];

/** How far below the origin the wheels touch, in metres. */
export const GEAR_BOTTOM = -1.3;
/** Where the propeller hub sits, so the renderer can spin the prop around z. */
export const PROP_HUB = { x: 0, y: 0.02, z: -3.14 };

/** The fixed airframe: fuselage, cowl, canopy, wings, tail and lights. */
export function buildAirframe() {
  const g = new GeometryBuilder();
  // Nose cowl and engine cheeks, red.
  g.frustum(0, 0.02, 0.08, -3.05, -1.85, 0.34, 0.36, 0.52, 0.55, RED);
  // Cabin section of the fuselage, cream.
  g.frustum(0, 0.08, 0.14, -1.85, 1.4, 0.52, 0.55, 0.44, 0.5, CREAM);
  // Tail cone, tapering up to the fin.
  g.frustum(0, 0.14, 0.38, 1.4, 3.55, 0.44, 0.5, 0.13, 0.2, CREAM);
  // The glasshouse canopy.
  g.frustum(0, 0.66, 0.6, -1.2, 0.8, 0.33, 0.16, 0.35, 0.27, GLASS);
  // Cheatline stripes down both flanks.
  g.box(0.5, 0.0, 0.1, 0.05, 0.15, 3.1, RED);
  g.box(-0.5, 0.0, 0.1, 0.05, 0.15, 3.1, RED);
  // Main wing, shoulder-mounted, with red tips.
  g.box(0, -0.3, -0.55, 10.8, 0.15, 1.75, CREAM);
  g.box(5.05, -0.3, -0.55, 0.75, 0.16, 1.75, RED);
  g.box(-5.05, -0.3, -0.55, 0.75, 0.16, 1.75, RED);
  // Wing struts down to the lower fuselage.
  g.box(1.5, -0.62, -0.5, 0.08, 0.6, 0.08, METAL);
  g.box(-1.5, -0.62, -0.5, 0.08, 0.6, 0.08, METAL);
  // Tailplane and fin.
  g.box(0, 0.42, 3.25, 3.3, 0.11, 0.95, CREAM);
  g.box(0, 0.98, 3.2, 0.1, 1.05, 0.95, RED);
  g.box(0, 0.92, 3.66, 0.09, 0.9, 0.24, CREAM);
  // Exhaust stub, aerial mast and a pitot tube under the port wing.
  g.box(0.3, -0.52, -2.2, 0.12, 0.12, 0.5, METAL);
  g.box(0, 1.02, -0.3, 0.03, 0.44, 0.03, METAL);
  g.box(-2.6, -0.42, -0.7, 0.04, 0.22, 0.3, METAL);
  // The anti-collision beacon on top of the fin, red as the fin's own tip.
  g.box(0, 1.56, 3.2, 0.09, 0.09, 0.3, [1.0, 0.12, 0.08]);
  // Navigation lights: port red, starboard green, tail white.
  g.box(-5.44, -0.3, -0.55, 0.1, 0.1, 0.3, [1.0, 0.12, 0.08]);
  g.box(5.44, -0.3, -0.55, 0.1, 0.1, 0.3, [0.1, 1.0, 0.3]);
  g.box(0, 0.42, 3.78, 0.08, 0.08, 0.06, [1.0, 0.98, 0.9]);
  return g.build();
}

/** The propeller: two crossed blades, cream tips, a spinner and a blur disc. */
export function buildPropeller() {
  const g = new GeometryBuilder();
  g.box(0, 0, 0, 0.17, 2.3, 0.05, METAL);
  g.box(0, 0, 0, 2.3, 0.17, 0.05, METAL);
  g.box(0, 1.02, 0, 0.18, 0.3, 0.055, CREAM);
  g.box(0, -1.02, 0, 0.18, 0.3, 0.055, CREAM);
  g.box(1.02, 0, 0, 0.3, 0.18, 0.055, CREAM);
  g.box(-1.02, 0, 0, 0.3, 0.18, 0.055, CREAM);
  g.frustum(0, 0, 0, -0.36, 0.04, 0.02, 0.02, 0.21, 0.21, RED);
  g.disc(0, 0, 0.05, 1.18, [0.25, 0.22, 0.19], 0.15);
  return g.build();
}

/** The undercarriage: two main legs and wheels and a tail wheel, on its own so it can retract. */
export function buildGear() {
  const g = new GeometryBuilder();
  g.box(0.78, -0.72, -0.75, 0.09, 0.85, 0.09, METAL);
  g.box(-0.78, -0.72, -0.75, 0.09, 0.85, 0.09, METAL);
  g.box(0.78, -1.04, -0.75, 0.26, 0.52, 0.52, TYRE);
  g.box(-0.78, -1.04, -0.75, 0.26, 0.52, 0.52, TYRE);
  g.box(0.9, -1.04, -0.75, 0.04, 0.3, 0.3, CREAM);
  g.box(-0.9, -1.04, -0.75, 0.04, 0.3, 0.3, CREAM);
  g.box(0, -0.62, 3.32, 0.07, 0.62, 0.07, METAL);
  g.box(0, -1.16, 3.36, 0.15, 0.28, 0.28, TYRE);
  return g.build();
}
