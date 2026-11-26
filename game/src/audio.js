// Golden Hour — procedural sound, all of it synthesised: no audio files.
// A Web Audio engine note and propeller noise follow the throttle and the airspeed;
// rings chime, the gear clunks, arrivals thud in proportion to their firmness, and a
// stalled wing gets a warning beeper. Sound starts on the pilot's first key or click.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.beepTimer = 0;
  }

  /** Create the context and the running engine/wind loops. Safe to call repeatedly. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    // A gentle limiter on the way out, so a crash thump over the engine never clips.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 18;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    // The engine: a low sawtooth whose pitch follows the rpm, through a soft filter.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 21;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    this.engineSub.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineSub.start();

    // The wind and propeller: looped noise through a bandpass that opens with speed.
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer;
    this.noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.noise.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** Keep the loops honest with the aeroplane, and beep while the wing is stalled. */
  update(dt, flight) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = flight.rpm;
    this.engineOsc.frequency.setTargetAtTime(38 + rpm * 62 + Math.sin(t * 31) * rpm * 2.2, t, 0.05);
    this.engineSub.frequency.setTargetAtTime(19 + rpm * 31, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + rpm * 0.16, t, 0.08);
    const wind = Math.min(1, flight.speed / 95);
    this.windGain.gain.setTargetAtTime(wind * wind * 0.22, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(320 + wind * 900, t, 0.1);
    if (flight.stalled && flight.airborne) {
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) {
        this.beepTimer = 0.3;
        this.tone(1180, 0.09, 0.12, 'square');
      }
    }
  }

  /** A short sine or square blip, for chimes and beeps. */
  tone(freq, seconds, gain, type = 'sine', when = 0, slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = ctx.currentTime + when;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + seconds);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A burst of filtered noise: thuds, clunks and the crash. */
  noiseBurst(seconds, gain, filterFreq) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noise.buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    const start = ctx.currentTime;
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(start, Math.random() * 1.2);
    source.stop(start + seconds + 0.02);
  }

  /** The event sounds the flight model asks for, by name. */
  play(name, detail = 0) {
    if (!this.ctx) return;
    switch (name) {
      case 'ring':
        this.tone(880, 0.14, 0.16);
        this.tone(1318, 0.2, 0.14, 'sine', 0.07);
        break;
      case 'ring-centre':
        this.tone(990, 0.14, 0.17);
        this.tone(1480, 0.24, 0.16, 'sine', 0.07);
        break;
      case 'course':
        this.tone(784, 0.16, 0.16);
        this.tone(988, 0.16, 0.16, 'sine', 0.12);
        this.tone(1318, 0.3, 0.17, 'sine', 0.24);
        break;
      case 'gear':
        this.noiseBurst(0.16, 0.2, 500);
        this.tone(140, 0.12, 0.1, 'square');
        break;
      case 'touchdown':
        this.noiseBurst(0.22, 0.25 + Math.min(0.4, detail * 0.12), 300);
        break;
      case 'crash':
        this.noiseBurst(0.9, 0.55, 240);
        this.tone(90, 0.7, 0.3, 'sawtooth', 0, 34);
        break;
      case 'flameout':
        this.tone(420, 0.5, 0.14, 'sawtooth', 0, 90);
        break;
      case 'airborne':
        this.tone(660, 0.12, 0.07);
        break;
      default:
        break;
    }
  }
}
