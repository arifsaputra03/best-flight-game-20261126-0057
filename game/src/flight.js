// Golden Hour — the flight model and the sortie.
// An arcade-true model: the wing lifts, stalls and drops its nose; banks turn the
// aeroplane; the ground grades every arrival. One sortie is a story: take off from
// Gullwing Bay, thread six rings around the bay, come home and land — on fuel that
// is always quietly running out.

import { LANDING, PLANE, RUNWAY, SCORE } from './config.js';
import { GEAR_BOTTOM } from './aircraft.js';
import { RINGS, RING_RADIUS, heightAt, isWaterAt, onRunwayAt } from './world.js';
import { clamp } from './random.js';

const BELLY_BOTTOM = -0.55; // fuselage underside, for gear-up arrivals
const GRAVITY = 9.81;

export class Flight {
  constructor() {
    this.reset();
  }

  /** Back on the runway threshold, engine off, tanks full, score wiped. */
  reset() {
    this.pos = { x: -430, y: 0, z: RUNWAY.z };
    this.pos.y = heightAt(this.pos.x, this.pos.z) - GEAR_BOTTOM;
    this.heading = Math.PI / 2; // east, down the runway
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.throttle = 0;
    this.rpm = 0;
    this.propAngle = 0;
    this.gearDown = true;
    this.gearTransit = 0; // seconds of gear travel left; the gear is neither up nor down
    this.brakes = false;
    this.fuel = 100;
    this.damage = 0;
    this.airborne = false;
    this.stalled = false;
    this.finishing = false; // a good touchdown is made; roll to a stop to end the sortie
    this.touchdownGrade = null;
    this.landedInfo = null;
    this.crashReason = null;
    this.score = 0;
    this.ringsDone = 0;
    this.elapsed = 0;
    this.events = [];
    this.message = 'THROTTLE UP WITH W — ROTATE AT 60 KNOTS';
    this.messageTime = 6;
    this.prevPos = { ...this.pos };
  }

  /** Compass heading in degrees, 0-360. */
  get headingDeg() {
    const deg = (this.heading * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
  }

  /** Height of the wheels above the ground or water right now, in metres. */
  get heightAboveGround() {
    const ground = Math.max(heightAt(this.pos.x, this.pos.z), 0.6);
    return this.pos.y + (this.gearDown ? GEAR_BOTTOM : BELLY_BOTTOM) - ground;
  }

  /** The ring the pilot should aim for, or null when the course is done. */
  get nextRing() {
    return this.ringsDone < RINGS.length ? RINGS[this.ringsDone] : null;
  }

  say(text, seconds = 3.5) {
    this.message = text;
    this.messageTime = seconds;
  }

  /** Advance the sortie by dt seconds, reading the pilot's hands from input. */
  step(dt, input) {
    this.elapsed += dt;
    if (this.messageTime > 0) this.messageTime -= dt;
    this.prevPos = { ...this.pos };

    if (input.wasPressed('KeyG') && !this.finishing) {
      this.gearDown = !this.gearDown;
      this.gearTransit = 1.1;
      this.events.push('gear');
      this.say(this.gearDown ? 'GEAR DOWN' : 'GEAR UP', 1.6);
    }
    if (this.gearTransit > 0) this.gearTransit -= dt;
    this.brakes = input.down('KeyB');

    this.stepEngine(dt, input);
    this.stepControls(dt, input);
    this.stepMotion(dt);
    this.stepGround(dt);
    this.stepRings();
  }

  stepEngine(dt, input) {
    if (this.finishing) {
      this.throttle = 0;
    } else {
      const lever = input.throttleRate() * dt + input.takeWheelSteps() * 0.07;
      this.throttle = clamp(this.throttle + lever, 0, 1);
    }
    const target = this.fuel > 0 ? this.throttle : 0;
    const lag = target > this.rpm ? 0.9 : 1.4; // spools up slower than it winds down
    this.rpm += clamp(target - this.rpm, -lag * dt, lag * dt);
    if (this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - this.rpm * dt * 0.42);
      if (this.fuel === 0) {
        this.events.push('flameout');
        this.say('FUEL EMPTY — GLIDE FOR THE FIELD', 5);
      }
    }
    this.propAngle += (this.rpm * 34 + this.speed * 0.35) * dt;
  }

  stepControls(dt, input) {
    const pitchCmd = input.pitchCommand();
    const rollCmd = input.rollCommand();
    const rudder = input.rudderCommand();
    const authority = this.airborne ? 1 : clamp(this.speed / PLANE.rotateSpeed, 0, 1);

    // Pitch: the elevator answers in proportion to the air over it.
    let pitchRate = pitchCmd * 0.85 * clamp(this.speed / 34, 0.15, 1);
    if (this.stalled) pitchRate -= 0.5; // a stalled wing drops its own nose
    if (!this.airborne && this.speed < PLANE.rotateSpeed) pitchRate = Math.min(pitchRate, 0);
    this.pitch = clamp(this.pitch + pitchRate * dt, -0.48, 0.52);

    // Roll: ease toward the commanded bank; on the ground the target is wings-level.
    const targetRoll = this.airborne ? rollCmd * 1.02 : 0;
    const rollStep = clamp(targetRoll - this.roll, -2.4 * dt, 2.4 * dt);
    this.roll += this.airborne ? rollStep : rollStep * authority;

    // Heading: a banked wing turns the aeroplane; the rudder helps and steers on the ground.
    if (this.airborne) {
      const turn = (GRAVITY * Math.tan(this.roll)) / Math.max(this.speed, 14);
      this.heading += clamp(turn, -0.55, 0.55) * dt;
      this.heading += rudder * 0.14 * clamp(this.speed / 40, 0.2, 1) * dt;
    } else {
      const steer = (rudder + rollCmd * 0.6) * clamp(1.2 - this.speed / 60, 0.15, 1);
      this.heading += steer * dt * clamp(this.speed / 6, 0, 1);
    }
  }

  stepMotion(dt) {
    // Thrust, drag and the weight's pull along the flight path set the speed.
    const thrust = this.rpm * 13.5;
    let drag = 0.0016 * this.speed * this.speed + (this.gearDown ? 0.35 : 0.05);
    if (!this.gearDown && this.gearTransit > 0) drag += 0.3; // doors open, legs travelling
    if (this.brakes && this.airborne) drag += 2.6; // airbrake
    let accel = thrust - drag;
    if (this.airborne) {
      accel -= GRAVITY * Math.sin(this.pitch);
    } else {
      accel -= 0.55; // rolling friction
      if (this.brakes) accel -= 5.5;
      if (this.finishing) accel -= 3.2; // the pilot stands on the brakes after touchdown
    }
    this.speed = Math.max(0, this.speed + accel * dt);

    // Climb: the flight path, minus the sink of a wing short of flying speed.
    this.stalled = this.airborne && this.speed < PLANE.stallSpeed;
    let sink = 0;
    if (this.airborne && this.speed < PLANE.stallSpeed + 6) {
      const shortfall = clamp((PLANE.stallSpeed + 6 - this.speed) / (PLANE.stallSpeed + 6), 0, 1);
      sink = shortfall * shortfall * 8.5;
    }
    this.verticalSpeed = this.speed * Math.sin(this.pitch) - sink;

    const forward = this.speed * Math.cos(this.pitch);
    this.pos.x += Math.sin(this.heading) * forward * dt;
    this.pos.z += -Math.cos(this.heading) * forward * dt;
    this.pos.y += this.verticalSpeed * dt;
    this.pos.x = clamp(this.pos.x, -3080, 3080);
    this.pos.z = clamp(this.pos.z, -3080, 3080);
    if (this.pos.y > 900) this.pos.y = 900;
  }

  stepGround(dt) {
    const terrain = heightAt(this.pos.x, this.pos.z);
    const water = terrain < 0.6;
    const surface = water ? 0.6 : terrain;
    const bottom = this.gearDown ? GEAR_BOTTOM : BELLY_BOTTOM;
    const wheelY = this.pos.y + bottom;

    if (!this.airborne) {
      // Rolling: sit on the surface, and leave it when the wing can hold us.
      this.pos.y = surface - bottom;
      this.verticalSpeed = 0;
      const liftOff = this.speed > PLANE.rotateSpeed && this.pitch > 0.06 && this.speed * Math.sin(this.pitch) > 0.4;
      if (liftOff && !this.finishing) {
        this.airborne = true;
        this.events.push('airborne');
        if (this.ringsDone === 0 && this.touchdownGrade === null) this.say('AIRBORNE — GEAR UP WITH G, CHASE THE GOLD RING', 4);
      }
      if (this.finishing && this.speed < 0.8) {
        this.speed = 0;
        this.landedInfo = this.touchdownGrade;
        this.events.push('landed');
      }
      return;
    }

    if (wheelY > surface) return; // still flying

    // Touchdown: grade the arrival.
    const sink = -this.verticalSpeed;
    const onStrip = onRunwayAt(this.pos.x, this.pos.z);
    if (!this.gearDown || this.gearTransit > 0) {
      this.crash('THE GEAR WAS NOT DOWN — THE BELLY TOOK THE ARRIVAL');
      return;
    }
    if (water) {
      this.crash('DITCHED IN THE BAY');
      return;
    }
    if (sink > LANDING.crash) {
      this.crash('ARRIVED TOO FAST DOWNWARD — THE AIRFRAME GAVE UP');
      return;
    }
    if (this.speed > PLANE.touchdownMaxSpeed) {
      this.crash('TOUCHED DOWN FAR TOO FAST — THE GEAR COLLAPSED');
      return;
    }
    let grade;
    if (sink <= LANDING.greased) grade = 'GREASED';
    else if (sink <= LANDING.firm) grade = 'FIRM';
    else if (sink <= LANDING.hard) grade = 'HARD';
    else {
      this.damage += 45;
      grade = 'HEAVY';
    }
    if (!onStrip) {
      this.damage += grade === 'GREASED' ? 8 : 22;
      grade = 'ROUGH FIELD — ' + grade;
    }
    if (this.damage >= 100) {
      this.crash('THE AIRFRAME WAS ALREADY BENT — IT FOLDED ON ARRIVAL');
      return;
    }
    this.airborne = false;
    this.finishing = true;
    this.pitch = 0;
    this.roll = 0;
    this.touchdownGrade = {
      grade,
      sink,
      onStrip,
      courseComplete: this.ringsDone >= RINGS.length,
    };
    this.events.push('touchdown');
    this.say('TOUCHDOWN — ' + grade + ' — BRAKE TO A STOP', 4);
  }

  stepRings() {
    const ring = this.nextRing;
    if (!ring || !this.airborne) return;
    const facing = ring.facing;
    const before = planeDistance(this.prevPos, ring, facing);
    const after = planeDistance(this.pos, ring, facing);
    if (before >= 0 || after < 0) return; // have not crossed the gate's plane yet
    const rel = {
      x: this.pos.x - ring.x,
      y: this.pos.y - ring.y,
      z: this.pos.z - ring.z,
    };
    const lateral = Math.hypot(
      rel.x - facing.x * after,
      rel.y - facing.y * after,
      rel.z - facing.z * after,
    );
    if (lateral > RING_RADIUS) return; // crossed the plane wide of the gate
    const centre = lateral <= 9;
    this.score += centre ? SCORE.ringCentre : SCORE.ringEdge;
    this.ringsDone += 1;
    this.events.push(centre ? 'ring-centre' : 'ring');
    if (this.ringsDone >= RINGS.length) {
      this.score += SCORE.courseComplete;
      this.events.push('course');
      this.say('COURSE COMPLETE — COME HOME AND LAND ON THE STRIP', 5);
    } else {
      this.say((centre ? 'THROUGH THE MIDDLE! ' : 'THROUGH! ') + 'RING ' + this.ringsDone + ' OF ' + RINGS.length, 2.6);
    }
  }

  crash(reason) {
    this.crashReason = reason;
    this.airborne = false;
    this.events.push('crash');
  }

  /** The sortie's final score once landed: landing grade plus the fuel still aboard. */
  finalScore() {
    if (!this.landedInfo) return this.score;
    let bonus = 0;
    if (this.landedInfo.grade.includes('GREASED')) bonus += SCORE.landingGreased;
    else if (this.landedInfo.grade.includes('FIRM')) bonus += SCORE.landingFirm;
    else if (this.landedInfo.grade.includes('HARD')) bonus += SCORE.landingHard;
    if (this.landedInfo.courseComplete) bonus += Math.round(this.fuel) * SCORE.fuelPerUnit;
    return this.score + bonus;
  }
}

/** Signed distance from a point to a ring's plane, along the gate's facing. */
function planeDistance(pos, ring, facing) {
  return (pos.x - ring.x) * facing.x + (pos.y - ring.y) * facing.y + (pos.z - ring.z) * facing.z;
}
