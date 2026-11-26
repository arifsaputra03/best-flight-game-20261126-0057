// Golden Hour — shared tuning constants for the flight model, the world and the sortie.
// Everything the other modules agree on lives here: sizes, speeds, colours of the light.

/** The world is a square of this many metres on a side, centred on the origin. */
export const WORLD_SIZE = 6400;
/** Sea level: the bay's surface height in metres. Terrain below this is under water. */
export const SEA_LEVEL = 0.6;
/** The flat plateau the airfield sits on, in metres above sea level. */
export const FIELD_HEIGHT = 12;

/** Runway: centre, heading and size. It runs east-west; take off toward the east (090). */
export const RUNWAY = {
  x: 0,
  z: 620,
  headingDeg: 90,
  length: 1050,
  width: 46,
  height: FIELD_HEIGHT,
};

/** Speeds of the Kestrel KH-1, in metres per second. */
export const PLANE = {
  stallSpeed: 26, // below this the wing gives up and the nose drops
  rotateSpeed: 30, // on the ground, pitch only answers past this
  maxSpeed: 92, // level full-throttle speed, roughly
  touchdownMaxSpeed: 40, // landing faster than this tears the gear off
  propRadius: 1.15,
};

/** Touchdown vertical speeds (m/s, positive = sinking) that grade a landing. */
export const LANDING = {
  greased: 1.1, // silk: full bonus
  firm: 2.1, // a thump the passengers feel, still safe
  hard: 3.4, // safe but the airframe takes damage
  crash: 5.2, // beyond this the aeroplane does not fly again
};

/** Scoring: what a sortie pays. */
export const SCORE = {
  ringCentre: 150, // through the middle of a ring
  ringEdge: 100, // through a ring, off centre
  courseComplete: 250, // all six rings, in order
  landingGreased: 300,
  landingFirm: 200,
  landingHard: 80,
  fuelPerUnit: 2, // bonus per percent of fuel still in the tank at shutdown
};

/** The golden-hour palette the sky, fog and water share. */
export const LIGHT = {
  sunDirection: [-0.55, 0.34, -0.76], // low in the west-northwest, normalised in the renderer
  sunColour: [1.0, 0.72, 0.45],
  skyHorizon: [0.98, 0.62, 0.38],
  skyZenith: [0.25, 0.42, 0.72],
  fogColour: [0.96, 0.66, 0.44],
  fogDensity: 0.0004,
  waterColour: [0.13, 0.32, 0.42],
};

/** Camera modes, cycled with the C key. */
export const CAMERA_COCKPIT = 'cockpit';
export const CAMERA_CHASE = 'chase';

/** Game screens the state machine walks through. */
export const SCREEN_TITLE = 'title';
export const SCREEN_FLYING = 'flying';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';
