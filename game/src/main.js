// Golden Hour — the game itself: boot, the frame loop, the cameras, the screens.
// A sortie runs title -> flying -> landed or crashed, with the renderer drawing the
// world, the HUD drawing the instruments, and the flight model keeping the score.
// A ?shot=<name> page renders one staged moment instead, for the screenshots.

import {
  CAMERA_CHASE,
  CAMERA_COCKPIT,
  SCREEN_CRASHED,
  SCREEN_FLYING,
  SCREEN_LANDED,
  SCREEN_TITLE,
} from './config.js';
import { Audio } from './audio.js';
import { Flight } from './flight.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Renderer } from './render3d.js';
import { applyShot, stageShot } from './shots.js';
import { RINGS } from './world.js';
import { clamp } from './random.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const renderer = new Renderer(glCanvas);
const hud = new Hud(hudCanvas);
const input = new Input(glCanvas);
const audio = new Audio();
const flight = new Flight();

let screen = SCREEN_TITLE;
let camera = CAMERA_COCKPIT;
let paused = false;
let muted = false;
let chasePos = null;
let elapsed = 0;

if (shotName) {
  const scene = stageShot(shotName);
  applyShot(flight, scene);
  camera = scene.camera;
  screen = SCREEN_FLYING;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  for (const canvas of [glCanvas, hudCanvas]) {
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
}
window.addEventListener('resize', resize);
resize();

/** The aeroplane's own axes from its attitude: forward, right and up unit vectors. */
function planeBasis(f, rollScale = 1) {
  const cosP = Math.cos(f.pitch);
  const fwd = [Math.sin(f.heading) * cosP, Math.sin(f.pitch), -Math.cos(f.heading) * cosP];
  const right0 = [Math.cos(f.heading), 0, Math.sin(f.heading)];
  const up0 = [
    right0[1] * fwd[2] - right0[2] * fwd[1],
    right0[2] * fwd[0] - right0[0] * fwd[2],
    right0[0] * fwd[1] - right0[1] * fwd[0],
  ];
  const roll = f.roll * rollScale;
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const right = [
    right0[0] * cosR - up0[0] * sinR,
    right0[1] * cosR - up0[1] * sinR,
    right0[2] * cosR - up0[2] * sinR,
  ];
  // Up completes the frame: right cross forward (never the other way round).
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  return { fwd, right, up };
}

/** Where the camera sits and looks this frame, for the title orbit or a flight view. */
function computeCamera(dt) {
  const f = flight;
  if (screen === SCREEN_TITLE) {
    const a = elapsed * 0.07;
    const pos = [f.pos.x + Math.cos(a) * 30, f.pos.y + 6.5, f.pos.z + Math.sin(a) * 30];
    return { pos, target: [f.pos.x, f.pos.y + 0.5, f.pos.z], up: [0, 1, 0], fovY: 1.02, basis: planeBasis(f) };
  }
  const basis = planeBasis(f);
  if (camera === CAMERA_COCKPIT) {
    const eye = [
      f.pos.x + basis.up[0] * 0.98 + basis.fwd[0] * 0.15,
      f.pos.y + basis.up[1] * 0.98 + basis.fwd[1] * 0.15,
      f.pos.z + basis.up[2] * 0.98 + basis.fwd[2] * 0.15,
    ];
    const target = [
      eye[0] + basis.fwd[0] * 60,
      eye[1] + basis.fwd[1] * 60,
      eye[2] + basis.fwd[2] * 60,
    ];
    return { pos: eye, target, up: basis.up, fovY: 1.12, basis };
  }
  // Chase: a smoothed post behind and above, the horizon kept nearly honest.
  const soft = planeBasis(f, 0.45);
  const wanted = [
    f.pos.x - soft.fwd[0] * 15.5 + soft.up[0] * 5.2,
    f.pos.y - soft.fwd[1] * 15.5 + soft.up[1] * 5.2,
    f.pos.z - soft.fwd[2] * 15.5 + soft.up[2] * 5.2,
  ];
  if (!chasePos) chasePos = wanted;
  const blend = 1 - Math.exp(-dt * 5);
  chasePos = [
    chasePos[0] + (wanted[0] - chasePos[0]) * blend,
    chasePos[1] + (wanted[1] - chasePos[1]) * blend,
    chasePos[2] + (wanted[2] - chasePos[2]) * blend,
  ];
  const target = [
    f.pos.x + basis.fwd[0] * 26,
    f.pos.y + basis.fwd[1] * 26 + 1.2,
    f.pos.z + basis.fwd[2] * 26,
  ];
  const up = [
    soft.up[0] * 0.45,
    soft.up[1] * 0.45 + 0.55,
    soft.up[2] * 0.45,
  ];
  return { pos: chasePos, target, up, fovY: 1.04, basis };
}

/** Project the next ring into HUD space: a diamond on it, or an arrow at the edge. */
function computeRingMarker(cam, width, height) {
  const ring = flight.nextRing;
  if (!ring || screen !== SCREEN_FLYING) return null;
  const rel = [ring.x - cam.pos[0], ring.y - cam.pos[1], ring.z - cam.pos[2]];
  const fwd = normalise([
    cam.target[0] - cam.pos[0],
    cam.target[1] - cam.pos[1],
    cam.target[2] - cam.pos[2],
  ]);
  const right = normalise(cross(fwd, cam.up));
  const up = cross(right, fwd);
  const cz = dot(rel, fwd);
  const cx = dot(rel, right);
  const cy = dot(rel, up);
  const distance = Math.hypot(rel[0], rel[1], rel[2]);
  const tanV = Math.tan(cam.fovY / 2);
  const tanH = tanV * (width / height);
  if (cz > 4) {
    const ndcX = cx / cz / tanH;
    const ndcY = cy / cz / tanV;
    if (Math.abs(ndcX) < 0.94 && Math.abs(ndcY) < 0.9) {
      return {
        x: (ndcX * 0.5 + 0.5) * width,
        y: (0.5 - ndcY * 0.5) * height,
        distance,
        onScreen: true,
        angle: 0,
      };
    }
    return edgeMarker(ndcX, ndcY, width, height, distance);
  }
  return edgeMarker(cx, -cy, width, height, distance);
}

function edgeMarker(dirX, dirY, width, height, distance) {
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const reach = Math.min(width, height) * 0.4;
  return {
    x: clamp(width / 2 + ux * reach, 30, width - 30),
    y: clamp(height / 2 - uy * reach, 46, height - 30),
    distance,
    onScreen: false,
    angle: Math.atan2(-uy, ux),
  };
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalise(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Read the one-shot keys that steer the game around the flight model. */
function stepScreens(dt) {
  if (input.anyGesture) audio.start();
  if (input.wasPressed('KeyM')) {
    muted = !muted;
    audio.setMuted(muted);
  }
  if (screen === SCREEN_TITLE) {
    flight.propAngle += dt * 2.2; // the engine idles, ticking over in the sun
    if (input.wasPressed('Enter')) {
      screen = SCREEN_FLYING;
      audio.start();
    }
    return;
  }
  if (input.wasPressed('KeyP') && screen === SCREEN_FLYING) paused = !paused;
  if (input.wasPressed('KeyC')) camera = camera === CAMERA_COCKPIT ? CAMERA_CHASE : CAMERA_COCKPIT;
  if (input.wasPressed('KeyR') && screen !== SCREEN_FLYING) {
    flight.reset();
    chasePos = null;
    screen = SCREEN_FLYING;
    return;
  }
  if (screen !== SCREEN_FLYING || paused) return;
  flight.step(dt, input);
  for (const event of flight.events) {
    if (event === 'landed') screen = SCREEN_LANDED;
    else if (event === 'crash') screen = SCREEN_CRASHED;
    else if (event === 'touchdown') audio.play('touchdown', -(flight.touchdownGrade?.sink ?? 2));
    else audio.play(event);
  }
  flight.events.length = 0;
  audio.update(dt, flight);
}

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  elapsed += dt;
  if (shotName) {
    // A staged moment: hold the aeroplane still, keep the propeller turning.
    flight.propAngle += dt * (4 + flight.rpm * 26);
  } else {
    stepScreens(dt);
  }
  const cam = computeCamera(dt);
  renderer.render({
    camPos: cam.pos,
    camTarget: cam.target,
    camUp: cam.up,
    fovY: cam.fovY,
    flight,
    ringsDone: flight.ringsDone,
    time: elapsed,
    cockpit: camera === CAMERA_COCKPIT && screen !== SCREEN_TITLE,
  });
  hud.draw({
    flight,
    screen,
    camera,
    time: elapsed,
    paused,
    muted,
    ringMarker: computeRingMarker(cam, hudCanvas.width, hudCanvas.height),
  });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
