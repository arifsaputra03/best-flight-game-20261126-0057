// Golden Hour — the instruments and the head-up display, drawn on a 2D overlay.
// In the cockpit the pilot gets a lit six-gauge dashboard under the glareshield;
// in the chase view the same facts ride as slim tapes. Either way the altitude,
// speed and heading are always on show, with the next ring marked in the sky.

import { CAMERA_COCKPIT, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_TITLE } from './config.js';
import { CONTROL_KEYS } from './input.js';
import { RINGS } from './world.js';

const BRASS = '#d9a441';
const CREAM = '#f3e5c8';
const GLOW = '#9fe870';
const WARN = '#ff5347';
const PANEL_TOP = '#241a12';
const PANEL_BOTTOM = '#120d09';

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** Draw one frame of overlay. view: { flight, screen, camera, time, paused, muted, ringMarker }. */
  draw(view) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (view.screen === SCREEN_TITLE) {
      this.drawTitle(w, h);
      return;
    }
    const f = view.flight;
    this.drawCompassStrip(w, f);
    this.drawTopBar(w, view);
    // In the cockpit the panel gauges carry speed, altitude and climb; the side
    // tapes belong to the chase view, where there is no panel to read.
    if (view.camera === CAMERA_COCKPIT) this.drawDashboard(w, h, f);
    else {
      this.drawTapes(w, h, f);
      this.drawCluster(w, h, f);
    }
    if (view.ringMarker) this.drawRingMarker(view.ringMarker, f);
    if (f.stalled) this.flashCentred(w, h * 0.3, 'STALL', view.time);
    if (f.messageTime > 0 && f.message) this.drawMessage(w, h, f.message);
    if (view.screen === SCREEN_LANDED) this.drawLanded(w, h, view);
    if (view.screen === SCREEN_CRASHED) this.drawCrashed(w, h, view);
    if (view.paused) this.veil(w, h, 'PAUSED — P TO RESUME');
  }

  // ------------------------------------------------------------ shared chrome

  drawTopBar(w, view) {
    const { ctx } = this;
    const f = view.flight;
    ctx.fillStyle = 'rgba(10, 8, 6, 0.55)';
    ctx.fillRect(0, 0, w, 34);
    ctx.fillStyle = BRASS;
    ctx.font = '700 15px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText('GOLDEN HOUR', 14, 22);
    ctx.fillStyle = CREAM;
    ctx.font = '600 15px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('SCORE ' + Math.round(f.finalScore()), 150, 22);
    ctx.textAlign = 'right';
    const rings = 'RINGS ' + f.ringsDone + ' / ' + RINGS.length;
    ctx.fillText(rings + '    FUEL ' + Math.ceil(f.fuel) + '%', w - 14, 22);
    if (view.muted) ctx.fillText('MUTED', w - 14, 48);
  }

  drawCompassStrip(w, f) {
    const { ctx } = this;
    const cx = w / 2;
    const heading = f.headingDeg;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 170, 40, 340, 26);
    ctx.clip();
    ctx.fillStyle = 'rgba(10, 10, 12, 0.5)';
    ctx.fillRect(cx - 170, 40, 340, 26);
    ctx.fillStyle = CREAM;
    ctx.font = '600 12px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    for (let deg = -60; deg <= 60; deg += 5) {
      const world = Math.round((heading + deg) / 5) * 5;
      const shown = ((world % 360) + 360) % 360;
      const x = cx + (world - heading) * 3.4;
      if (shown % 30 === 0) {
        const label = shown === 0 ? 'N' : shown === 90 ? 'E' : shown === 180 ? 'S' : shown === 270 ? 'W' : String(shown / 10).padStart(2, '0');
        ctx.fillText(label, x, 58);
      } else {
        ctx.fillRect(x - 0.5, 52, 1, 6);
      }
    }
    ctx.restore();
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.moveTo(cx - 6, 66);
    ctx.lineTo(cx + 6, 66);
    ctx.lineTo(cx, 72);
    ctx.closePath();
    ctx.fill();
  }

  drawTapes(w, h, f) {
    const { ctx } = this;
    const knots = f.speed * 1.944;
    const feet = f.pos.y * 3.281;
    const fpm = f.verticalSpeed * 196.85;
    this.tape(16, h * 0.32, 'SPD KT', knots, 0);
    this.tape(w - 116, h * 0.32, 'ALT FT', feet, 0);
    this.tape(w - 116, h * 0.32 + 64, 'V/S FPM', fpm, fpm < 0 ? 0 : 0);
  }

  tape(x, y, label, value, _unused) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(8, 10, 10, 0.62)';
    ctx.fillRect(x, y, 100, 52);
    ctx.strokeStyle = 'rgba(217, 164, 65, 0.6)';
    ctx.strokeRect(x + 0.5, y + 0.5, 99, 51);
    ctx.fillStyle = BRASS;
    ctx.font = '600 10px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 8, y + 15);
    ctx.fillStyle = CREAM;
    ctx.font = '700 24px ui-monospace, Menlo, monospace';
    const shown = label === 'V/S FPM' ? (value >= 0 ? '+' : '') + Math.round(value / 10) * 10 : Math.round(value);
    ctx.fillText(String(shown), x + 8, y + 42);
  }

  drawMessage(w, h, text) {
    const { ctx } = this;
    ctx.font = '700 17px "Arial Narrow", Arial, sans-serif';
    const width = ctx.measureText(text).width + 36;
    const x = (w - width) / 2;
    const y = h * 0.16;
    ctx.fillStyle = 'rgba(12, 9, 6, 0.72)';
    ctx.fillRect(x, y, width, 34);
    ctx.strokeStyle = BRASS;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 33);
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, y + 23);
  }

  flashCentred(w, y, text, time) {
    if (Math.floor(time * 2.4) % 2 !== 0) return;
    const { ctx } = this;
    ctx.fillStyle = WARN;
    ctx.font = '800 30px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, y);
  }

  drawRingMarker(marker, f) {
    const { ctx } = this;
    const { x, y, distance, onScreen } = marker;
    ctx.save();
    if (!onScreen) {
      // An edge arrow pointing the way to the gate.
      ctx.translate(x, y);
      ctx.rotate(marker.angle);
      ctx.fillStyle = '#ffd257';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -9);
      ctx.lineTo(-10, 9);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x + 14, y);
      ctx.lineTo(x, y + 14);
      ctx.lineTo(x - 14, y);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = CREAM;
      ctx.font = '600 12px "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(distance) + ' m', x, y + 30);
    }
    ctx.restore();
    void f;
  }

  // ------------------------------------------------------------ chase cluster

  drawCluster(w, h, f) {
    const { ctx } = this;
    const x = 16;
    const y = h - 108;
    ctx.fillStyle = 'rgba(8, 9, 10, 0.6)';
    ctx.fillRect(x, y, 218, 92);
    ctx.strokeStyle = 'rgba(217, 164, 65, 0.5)';
    ctx.strokeRect(x + 0.5, y + 0.5, 217, 91);
    this.bar(x + 12, y + 14, 130, 'THROTTLE', f.throttle, BRASS);
    this.bar(x + 12, y + 38, 130, 'FUEL', f.fuel / 100, f.fuel < 25 ? WARN : GLOW);
    this.gearLights(x + 156, y + 12, f);
    ctx.fillStyle = CREAM;
    ctx.font = '600 11px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'left';
    const state = f.gearDown ? 'GEAR DOWN' : f.gearTransit > 0 ? 'GEAR MOVING' : 'GEAR UP';
    ctx.fillText(state, x + 150, y + 52);
    if (f.brakes) {
      ctx.fillStyle = WARN;
      ctx.fillText('BRAKES', x + 150, y + 70);
    }
    if (f.damage > 0) {
      ctx.fillStyle = WARN;
      ctx.fillText('DAMAGE ' + Math.round(f.damage) + '%', x + 12, y + 82);
    }
    void w;
  }

  bar(x, y, width, label, fraction, colour) {
    const { ctx } = this;
    ctx.fillStyle = CREAM;
    ctx.font = '600 10px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y + 8, width, 7);
    ctx.fillStyle = colour;
    ctx.fillRect(x, y + 8, width * Math.max(0, Math.min(1, fraction)), 7);
  }

  gearLights(x, y, f) {
    const { ctx } = this;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(x + i * 20, y + 8, 6, 0, Math.PI * 2);
      if (f.gearTransit > 0) ctx.fillStyle = WARN;
      else if (f.gearDown) ctx.fillStyle = GLOW;
      else ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ the dashboard

  drawDashboard(w, h, f) {
    const { ctx } = this;
    const panelTop = h * 0.735;
    // The glareshield and panel, one warm dark sweep across the bottom.
    const grad = ctx.createLinearGradient(0, panelTop, 0, h);
    grad.addColorStop(0, PANEL_TOP);
    grad.addColorStop(1, PANEL_BOTTOM);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, panelTop + 18);
    ctx.quadraticCurveTo(w * 0.5, panelTop - 6, w, panelTop + 18);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(217, 164, 65, 0.35)';
    ctx.stroke();
    // A-pillars at the windshield edges: slim, and warm where the sun catches them.
    ctx.fillStyle = 'rgba(20, 15, 11, 0.88)';
    for (const side of [0, 1]) {
      ctx.beginPath();
      const bx = side === 0 ? 0 : w;
      const dir = side === 0 ? 1 : -1;
      ctx.moveTo(bx, h * 0.38);
      ctx.lineTo(bx + dir * w * 0.026, h * 0.42);
      ctx.lineTo(bx + dir * w * 0.052, panelTop + 22);
      ctx.lineTo(bx, panelTop + 22);
      ctx.closePath();
      ctx.fill();
    }
    // Six lit gauges in a row.
    const cy = panelTop + (h - panelTop) * 0.52;
    const r = Math.min(56, (h - panelTop) * 0.34, w * 0.05);
    const xs = [0.13, 0.275, 0.42, 0.565, 0.71, 0.865].map((t) => w * t);
    this.gaugeSpeed(xs[0], cy, r, f);
    this.gaugeAltitude(xs[1], cy, r, f);
    this.gaugeAttitude(xs[2], cy, r, f);
    this.gaugeHeading(xs[3], cy, r, f);
    this.gaugeVertical(xs[4], cy, r, f);
    this.gaugeEngine(xs[5], cy, r, f);
    // Throttle quadrant and gear lights in the strip beneath the gauges.
    this.bar(w * 0.35, h - 24, 150, 'THROTTLE', f.throttle, BRASS);
    this.gearLights(w * 0.58, h - 26, f);
  }

  gaugeFace(cx, cy, r, label) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1117';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a332a';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(159, 232, 112, 0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(243, 229, 200, 0.75)';
    ctx.font = '600 9px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r * 0.62);
  }

  needle(cx, cy, r, angle, colour = CREAM) {
    const { ctx } = this;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * r * 0.18, cy - Math.sin(angle) * r * 0.18);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.82, cy + Math.sin(angle) * r * 0.82);
    ctx.stroke();
    ctx.fillStyle = '#1c1a17';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  ticks(cx, cy, r, count, majorEvery, labels, angleFor) {
    const { ctx } = this;
    ctx.fillStyle = CREAM;
    ctx.font = '600 9px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= count; i += 1) {
      const a = angleFor(i);
      const major = i % majorEvery === 0;
      const r0 = r * (major ? 0.78 : 0.85);
      ctx.strokeStyle = 'rgba(243, 229, 200, 0.8)';
      ctx.lineWidth = major ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93);
      ctx.stroke();
      if (labels && labels[i] !== undefined) {
        ctx.fillText(labels[i], cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6 + 3);
      }
    }
  }

  gaugeSpeed(cx, cy, r, f) {
    this.gaugeFace(cx, cy, r, 'AIRSPEED KT');
    const knots = f.speed * 1.944;
    const angleFor = (i) => Math.PI * 0.75 + (i / 28) * Math.PI * 1.5;
    this.ticks(cx, cy, r, 28, 7, { 0: '0', 7: '40', 14: '80', 21: '120', 28: '160' }, angleFor);
    // Green arc of the honest working range.
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(159, 232, 112, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.88, angleFor(8), angleFor(19));
    ctx.stroke();
    this.needle(cx, cy, r, Math.PI * 0.75 + Math.min(knots, 160) / 160 * Math.PI * 1.5);
  }

  gaugeAltitude(cx, cy, r, f) {
    this.gaugeFace(cx, cy, r, 'ALTIMETER FT');
    const feet = Math.max(0, f.pos.y * 3.281);
    const angleFor = (i) => -Math.PI / 2 + (i / 10) * Math.PI * 2;
    this.ticks(cx, cy, r, 10, 1, null, angleFor);
    this.needle(cx, cy, r, -Math.PI / 2 + ((feet % 1000) / 1000) * Math.PI * 2);
    this.needle(cx, cy, r * 0.62, -Math.PI / 2 + ((feet % 10000) / 10000) * Math.PI * 2, BRASS);
    const { ctx } = this;
    ctx.fillStyle = CREAM;
    ctx.font = '700 12px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(feet)), cx, cy + r * 0.36);
  }

  gaugeAttitude(cx, cy, r, f) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1117';
    ctx.fill();
    ctx.clip();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-f.roll);
    const pitchPx = f.pitch * r * 1.5;
    ctx.fillStyle = '#3d6f9e';
    ctx.fillRect(-r, -r * 2 + pitchPx, r * 2, r * 2);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-r, pitchPx, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r, pitchPx);
    ctx.lineTo(r, pitchPx);
    ctx.stroke();
    for (const deg of [-20, -10, 10, 20]) {
      const y = pitchPx - deg * (Math.PI / 180) * r * 1.5;
      const half = deg % 20 === 0 ? r * 0.34 : r * 0.22;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }
    ctx.restore();
    // The fixed aeroplane symbol and bezel.
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy);
    ctx.lineTo(cx - r * 0.16, cy);
    ctx.lineTo(cx, cy + r * 0.1);
    ctx.lineTo(cx + r * 0.16, cy);
    ctx.lineTo(cx + r * 0.55, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a332a';
    ctx.stroke();
    ctx.fillStyle = 'rgba(243, 229, 200, 0.75)';
    ctx.font = '600 9px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r * 0.62);
  }

  gaugeHeading(cx, cy, r, f) {
    this.gaugeFace(cx, cy, r, 'HEADING');
    const { ctx } = this;
    const heading = f.headingDeg;
    ctx.fillStyle = CREAM;
    ctx.font = '700 11px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    for (let deg = 0; deg < 360; deg += 30) {
      const a = ((deg - heading) * Math.PI) / 180 - Math.PI / 2;
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10).padStart(2, '0');
      ctx.fillText(label, cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68 + 4);
      ctx.strokeStyle = 'rgba(243,229,200,0.7)';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84);
      ctx.lineTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93);
      ctx.stroke();
    }
    // The lubber line and a little aeroplane.
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.97);
    ctx.lineTo(cx - 5, cy - r * 0.8);
    ctx.lineTo(cx + 5, cy - r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.3);
    ctx.lineTo(cx, cy + r * 0.34);
    ctx.moveTo(cx - r * 0.3, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.05);
    ctx.stroke();
  }

  gaugeVertical(cx, cy, r, f) {
    this.gaugeFace(cx, cy, r, 'VERT SPEED');
    const fpm = f.verticalSpeed * 196.85;
    const angleFor = (i) => Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
    this.ticks(cx, cy, r, 8, 2, { 0: '-2', 2: '-1', 4: '0', 6: '1', 8: '2' }, angleFor);
    const t = Math.max(-1, Math.min(1, fpm / 2000));
    this.needle(cx, cy, r, Math.PI * 0.75 + ((t + 1) / 2) * Math.PI * 1.5);
  }

  gaugeEngine(cx, cy, r, f) {
    this.gaugeFace(cx, cy, r, 'ENGINE · FUEL');
    const angleFor = (i) => Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    this.ticks(cx, cy, r, 10, 5, { 0: '0', 5: '50', 10: '100' }, angleFor);
    this.needle(cx, cy, r, Math.PI * 0.75 + f.rpm * Math.PI * 1.5, BRASS);
    // Fuel as a small arc under the needle: green to amber to red as it drains.
    const { ctx } = this;
    ctx.lineWidth = 4;
    ctx.strokeStyle = f.fuel < 25 ? WARN : GLOW;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, Math.PI * 0.8, Math.PI * 0.8 + (f.fuel / 100) * Math.PI * 1.4);
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.font = '600 9px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FUEL ' + Math.ceil(f.fuel) + '%', cx, cy + r * 0.36);
  }

  // ------------------------------------------------------------ full screens

  veil(w, h, text) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(8, 6, 5, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = CREAM;
    ctx.font = '700 26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2);
  }

  drawTitle(w, h) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(20, 10, 4, 0.25)');
    grad.addColorStop(0.55, 'rgba(20, 10, 4, 0.1)');
    grad.addColorStop(1, 'rgba(12, 7, 4, 0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = BRASS;
    ctx.font = '700 64px Georgia, serif';
    ctx.fillText('GOLDEN HOUR', w / 2, h * 0.3);
    ctx.fillStyle = CREAM;
    ctx.font = 'italic 19px Georgia, serif';
    ctx.fillText('Sunset sorties over Gullwing Bay, in the Kestrel KH-1', w / 2, h * 0.3 + 34);
    ctx.font = '600 16px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('TAKE OFF · THREAD THE SIX GOLD RINGS · COME HOME AND LAND BEFORE THE FUEL RUNS DRY', w / 2, h * 0.3 + 66);
    // The controls, two columns.
    ctx.font = '600 14px "Arial Narrow", Arial, sans-serif';
    const half = Math.ceil(CONTROL_KEYS.length / 2);
    for (let i = 0; i < CONTROL_KEYS.length; i += 1) {
      const col = i < half ? 0 : 1;
      const row = i % half;
      const x = w / 2 + (col === 0 ? -350 : 40);
      ctx.textAlign = 'left';
      ctx.fillStyle = BRASS;
      ctx.fillText(CONTROL_KEYS[i][0], x, h * 0.52 + row * 24);
      ctx.fillStyle = CREAM;
      ctx.fillText(CONTROL_KEYS[i][1], x + 195, h * 0.52 + row * 24);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd257';
    ctx.font = '700 22px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('PRESS ENTER TO FLY', w / 2, h * 0.86);
  }

  endPanel(w, h, title, lines, accent) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(10, 7, 5, 0.66)';
    ctx.fillRect(0, 0, w, h);
    const pw = 520;
    const ph = 64 + lines.length * 30 + 58;
    const x = (w - pw) / 2;
    const y = (h - ph) / 2;
    ctx.fillStyle = 'rgba(18, 13, 9, 0.92)';
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, pw - 2, ph - 2);
    ctx.fillStyle = accent;
    ctx.font = '700 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, y + 46);
    ctx.font = '600 16px "Arial Narrow", Arial, sans-serif';
    lines.forEach((line, i) => {
      ctx.fillStyle = line.startsWith('TOTAL') ? '#ffd257' : CREAM;
      ctx.fillText(line, w / 2, y + 88 + i * 30);
    });
    ctx.fillStyle = BRASS;
    ctx.font = '700 17px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('PRESS R TO FLY AGAIN', w / 2, y + ph - 22);
  }

  drawLanded(w, h, view) {
    const f = view.flight;
    const info = f.landedInfo ?? { grade: '—', sink: 0, onStrip: false, courseComplete: false };
    const lines = [
      'Touchdown: ' + info.grade + ' at ' + Math.abs(info.sink * 196.85).toFixed(0) + ' ft/min',
      info.onStrip ? 'On the runway at Gullwing Bay' : 'Off the strip, in the rough',
      'Rings flown: ' + f.ringsDone + ' of ' + RINGS.length + (info.courseComplete ? ' — course complete' : ''),
      'Ring and course points: ' + Math.round(f.score),
      'Landing and fuel bonus: ' + Math.round(f.finalScore() - f.score),
      'TOTAL SCORE: ' + Math.round(f.finalScore()),
    ];
    this.endPanel(w, h, 'DOWN SAFE', lines, GLOW);
  }

  drawCrashed(w, h, view) {
    const f = view.flight;
    const lines = [
      f.crashReason ?? 'THE SORTIE ENDED IN THE SCENERY',
      'Rings flown: ' + f.ringsDone + ' of ' + RINGS.length,
      'Score kept: ' + Math.round(f.score),
    ];
    this.endPanel(w, h, 'CRASHED', lines, WARN);
  }
}
