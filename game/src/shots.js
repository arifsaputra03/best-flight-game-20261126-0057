// Golden Hour — the staged scenes behind ?shot=<name>, one per screenshot.
// Each scene sets the aeroplane, the camera and the sortie to a real moment of a
// flight — final approach, a climbing turn, a gate lined up, the flare — and the
// game then renders that moment, propeller turning, exactly as it would in play.

import { CAMERA_CHASE, CAMERA_COCKPIT } from './config.js';

/** The screenshots to take, in dossier order: file name and the scene that fills it. */
export const SHOT_SCENES = [
  { name: '1-cockpit-approach.jpg', scene: 'cockpit' },
  { name: '2-chase-climb.jpg', scene: 'chase' },
  { name: '3-ring-over-town.jpg', scene: 'ring' },
  { name: '4-landing-flare.jpg', scene: 'flare' },
];

/**
 * Describe the named scene as overrides on a fresh flight: where the aeroplane is,
 * how it is flying, which camera watches, and what the sortie has done so far.
 */
export function stageShot(name) {
  switch (name) {
    case 'chase':
      return {
        camera: CAMERA_CHASE,
        pos: { x: 260, y: 158, z: -260 },
        heading: 0.72,
        pitch: 0.13,
        roll: 0.5,
        speed: 56,
        verticalSpeed: 4.2,
        throttle: 0.82,
        rpm: 0.85,
        gearDown: false,
        gearTransit: 0,
        fuel: 74,
        ringsDone: 1,
        score: 150,
        airborne: true,
        message: 'RING 1 OF 6 — CLIMBING FOR THE EAST FIELDS',
        messageTime: 999,
      };
    case 'ring':
      return {
        camera: CAMERA_COCKPIT,
        pos: { x: 1540, y: 133, z: -855 },
        heading: -0.62,
        pitch: -0.02,
        roll: 0.12,
        speed: 58,
        verticalSpeed: -0.6,
        throttle: 0.72,
        rpm: 0.74,
        gearDown: false,
        gearTransit: 0,
        fuel: 57,
        ringsDone: 2,
        score: 400,
        airborne: true,
        message: 'GATE 3 — OVER PORT SAFFRON',
        messageTime: 999,
      };
    case 'flare':
      return {
        camera: CAMERA_CHASE,
        pos: { x: -566, y: 15.6, z: 620 },
        heading: Math.PI / 2,
        pitch: 0.1,
        roll: 0.02,
        speed: 30,
        verticalSpeed: -0.7,
        throttle: 0.1,
        rpm: 0.14,
        gearDown: true,
        gearTransit: 0,
        fuel: 21,
        ringsDone: 6,
        score: 1150,
        airborne: true,
        message: 'FLARE — HOLD IT OFF, LET IT SETTLE',
        messageTime: 999,
      };
    case 'cockpit':
    default:
      return {
        camera: CAMERA_COCKPIT,
        pos: { x: -905, y: 56, z: 620 },
        heading: Math.PI / 2,
        pitch: -0.05,
        roll: 0.02,
        speed: 34,
        verticalSpeed: -2.3,
        throttle: 0.3,
        rpm: 0.34,
        gearDown: true,
        gearTransit: 0,
        fuel: 36,
        ringsDone: 5,
        score: 900,
        airborne: true,
        message: 'FINAL — GEAR DOWN, STRIP IN SIGHT',
        messageTime: 999,
      };
  }
}

/** Lay a staged scene over a flight object the game already made. */
export function applyShot(flight, scene) {
  flight.pos = { ...scene.pos };
  flight.heading = scene.heading;
  flight.pitch = scene.pitch;
  flight.roll = scene.roll;
  flight.speed = scene.speed;
  flight.verticalSpeed = scene.verticalSpeed;
  flight.throttle = scene.throttle;
  flight.rpm = scene.rpm;
  flight.gearDown = scene.gearDown;
  flight.gearTransit = scene.gearTransit;
  flight.fuel = scene.fuel;
  flight.ringsDone = scene.ringsDone;
  flight.score = scene.score;
  flight.airborne = scene.airborne;
  flight.message = scene.message;
  flight.messageTime = scene.messageTime;
  flight.stalled = false;
  flight.finishing = false;
  flight.touchdownGrade = null;
  flight.landedInfo = null;
  flight.crashReason = null;
  return flight;
}
