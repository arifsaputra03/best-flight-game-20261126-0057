// Golden Hour — keyboard and mouse input.
// One state object the flight model reads each frame: held keys by code, the mouse
// stick (drag to pitch and roll), wheel throttle nudges, and one-shot key presses.

/** Keys the game uses, listed so the help panel and the handlers never drift apart. */
export const CONTROL_KEYS = [
  ['ArrowUp / ArrowDown', 'pitch the nose down / up'],
  ['ArrowLeft / ArrowRight', 'roll left / right'],
  ['A / D', 'rudder left / right'],
  ['W / S', 'throttle up / down'],
  ['Mouse drag', 'stick: pitch and roll'],
  ['Mouse wheel', 'throttle'],
  ['G', 'landing gear up / down'],
  ['B', 'brakes / airbrake'],
  ['C', 'cockpit / chase camera'],
  ['Enter', 'start the sortie'],
  ['R', 'restart'],
  ['P', 'pause'],
  ['M', 'mute'],
];

export class Input {
  constructor(canvas) {
    this.keysDown = new Set();
    this.pressed = new Set(); // codes that went down since the last frame read them
    this.mouseX = 0; // stick deflection, -1..1, from dragging on the canvas
    this.mouseY = 0;
    this.mouseHeld = false;
    this.wheelDelta = 0; // accumulated wheel steps since the last frame
    this.anyGesture = false; // true after the first key or click, so audio may start
    this.attach(canvas);
  }

  attach(canvas) {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keysDown.add(event.code);
      this.pressed.add(event.code);
      this.anyGesture = true;
      if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keysDown.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouseHeld = false;
    });
    canvas.addEventListener('mousedown', (event) => {
      this.mouseHeld = true;
      this.anyGesture = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragBaseX = this.mouseX;
      this.dragBaseY = this.mouseY;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.mouseHeld) return;
      const scale = 220; // pixels of drag for a full stick deflection
      this.mouseX = clampUnit(this.dragBaseX + (event.clientX - this.dragStartX) / scale);
      this.mouseY = clampUnit(this.dragBaseY + (event.clientY - this.dragStartY) / scale);
    });
    window.addEventListener('mouseup', () => {
      this.mouseHeld = false;
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.wheelDelta += event.deltaY > 0 ? -1 : 1;
      this.anyGesture = true;
    }, { passive: false });
  }

  /** True while the key with this code is held down. */
  down(code) {
    return this.keysDown.has(code);
  }

  /** True once per physical press; reading it consumes the press. */
  wasPressed(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** The pilot's pitch command, -1 (nose down) .. 1 (nose up), keys and mouse combined. */
  pitchCommand() {
    let value = this.mouseY;
    if (this.down('ArrowDown')) value += 1;
    if (this.down('ArrowUp')) value -= 1;
    return clampUnit(value);
  }

  /** The pilot's roll command, -1 (roll left) .. 1 (roll right). */
  rollCommand() {
    let value = this.mouseX;
    if (this.down('ArrowRight')) value += 1;
    if (this.down('ArrowLeft')) value -= 1;
    return clampUnit(value);
  }

  /** The pilot's rudder command, -1 (yaw left) .. 1 (yaw right). */
  rudderCommand() {
    let value = 0;
    if (this.down('KeyD')) value += 1;
    if (this.down('KeyA')) value -= 1;
    return value;
  }

  /** Throttle lever rate from the held keys, in lever-travel per second. */
  throttleRate() {
    let value = 0;
    if (this.down('KeyW')) value += 0.55;
    if (this.down('KeyS')) value -= 0.55;
    return value;
  }

  /** Wheel steps since the last call; reading them consumes them. */
  takeWheelSteps() {
    const steps = this.wheelDelta;
    this.wheelDelta = 0;
    return steps;
  }
}

function clampUnit(value) {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}
