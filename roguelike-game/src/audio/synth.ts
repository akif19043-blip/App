import { type SfxName } from './sfx';

/**
 * Procedural 8-bit sound: every effect is synthesised on the fly with
 * oscillators, a shared noise buffer and gain envelopes. No audio files.
 */

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  freq: number;
  /** Frequency at the end of the sound (exponential slide). */
  to?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
  /** Vibrato depth in Hz. */
  vib?: number;
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  delay?: number;
}

/** Minimum seconds between two plays of the same effect (prevents mush). */
const RATE_LIMIT: Partial<Record<SfxName, number>> = {
  shoot: 0.06, dagger: 0.08, hit: 0.045, crit: 0.06, kill: 0.035, gem: 0.03, gold: 0.05,
  zap: 0.05, pulse: 0.2, spit: 0.12, hurt: 0.15,
};

const SEMI = Math.pow(2, 1 / 12);

export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private readonly last = new Map<SfxName, number>();
  sfxOn = true;
  musicOn = true;
  private musicTimer = 0;
  private nextNoteTime = 0;
  private step = 0;
  private musicPlaying = false;
  /** 0 = calm menu loop, 1 = full combat loop. */
  intensity = 0;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.05);
  }

  /** Pauses / resumes all audio (e.g. when the tab is hidden). */
  suspend(yes: boolean): void {
    if (!this.ctx) return;
    if (yes) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // ------------------------------------------------------------ primitives

  private tone(o: ToneOpts, bus: GainNode = this.sfxBus): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    if (o.vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 18;
      lg.gain.value = o.vib;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.02);
    }
    const vol = o.vol ?? 0.2;
    const atk = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private noise(o: NoiseOpts, bus: GainNode = this.sfxBus): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 4000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.02);
  }

  // ------------------------------------------------------------ effects

  play(name: SfxName, intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOn || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gap = RATE_LIMIT[name];
    if (gap !== undefined) {
      const prev = this.last.get(name) ?? -1;
      if (now - prev < gap) return;
    }
    this.last.set(name, now);
    const r = 0.94 + Math.random() * 0.12; // slight pitch variation
    switch (name) {
      case 'shoot':
        this.tone({ type: 'square', freq: 980 * r, to: 420, dur: 0.07, vol: 0.05 });
        break;
      case 'dagger':
        this.noise({ dur: 0.08, vol: 0.12, filter: 'bandpass', freq: 5000, to: 1500, q: 3 });
        break;
      case 'hit':
        this.tone({ type: 'square', freq: 220 * r, to: 110, dur: 0.05, vol: 0.06 });
        break;
      case 'crit':
        this.tone({ type: 'square', freq: 700 * r, to: 1400, dur: 0.06, vol: 0.07 });
        this.noise({ dur: 0.05, vol: 0.06, filter: 'highpass', freq: 3000 });
        break;
      case 'kill':
        this.noise({ dur: 0.12 * Math.min(2, intensity), vol: 0.1, filter: 'lowpass', freq: 2600 * r, to: 300 });
        this.tone({ type: 'triangle', freq: 330 * r, to: 90, dur: 0.1, vol: 0.07 });
        break;
      case 'gem': {
        // Rising pitch as pickups chain, like a combo meter.
        const f = 880 * Math.pow(SEMI, Math.min(intensity, 24) % 25);
        this.tone({ type: 'sine', freq: f, dur: 0.08, vol: 0.07 });
        this.tone({ type: 'square', freq: f * 2, dur: 0.04, vol: 0.015 });
        break;
      }
      case 'gold':
        this.tone({ type: 'square', freq: 1320, dur: 0.05, vol: 0.05 });
        this.tone({ type: 'square', freq: 1760, dur: 0.1, vol: 0.05, delay: 0.05 });
        break;
      case 'heal':
        [523, 659, 784].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.15, vol: 0.12, delay: i * 0.06 }));
        break;
      case 'chest':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.18, vol: 0.08, delay: i * 0.07 }));
        this.noise({ dur: 0.6, vol: 0.05, filter: 'highpass', freq: 6000, delay: 0.3 });
        break;
      case 'levelup':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.14, vol: 0.09, delay: i * 0.055 }));
        this.tone({ type: 'triangle', freq: 1568, dur: 0.4, vol: 0.08, delay: 0.28, vib: 12 });
        break;
      case 'hurt':
        this.tone({ type: 'sawtooth', freq: 180, to: 60, dur: 0.2, vol: 0.16 });
        this.noise({ dur: 0.12, vol: 0.12, freq: 1200 });
        break;
      case 'death':
        this.tone({ type: 'sawtooth', freq: 440, to: 40, dur: 1.2, vol: 0.2, vib: 20 });
        this.noise({ dur: 1.2, vol: 0.25, freq: 3000, to: 80 });
        break;
      case 'zap':
        this.noise({ dur: 0.18, vol: 0.14, filter: 'bandpass', freq: 3000 * r, to: 600, q: 2 });
        this.tone({ type: 'sawtooth', freq: 1400 * r, to: 200, dur: 0.12, vol: 0.05 });
        break;
      case 'pulse':
        this.tone({ type: 'sine', freq: 140, to: 70, dur: 0.18, vol: 0.1 });
        break;
      case 'spit':
        this.tone({ type: 'triangle', freq: 300 * r * (intensity > 1 ? 0.5 : 1), to: 700, dur: 0.1, vol: 0.06 });
        break;
      case 'boss':
        this.tone({ type: 'sawtooth', freq: 55, dur: 1.6, vol: 0.25, attack: 0.2, vib: 3 });
        this.tone({ type: 'sawtooth', freq: 82, dur: 1.6, vol: 0.18, attack: 0.2, vib: 4 });
        this.noise({ dur: 1.4, vol: 0.12, freq: 400, to: 2000 });
        break;
      case 'bossDie':
        this.noise({ dur: 1.5, vol: 0.35, freq: 5000, to: 60 });
        this.tone({ type: 'square', freq: 110, to: 30, dur: 1.2, vol: 0.2 });
        break;
      case 'click':
        this.tone({ type: 'square', freq: 660, dur: 0.035, vol: 0.06 });
        break;
      case 'select':
        this.tone({ type: 'square', freq: 784, dur: 0.07, vol: 0.08 });
        this.tone({ type: 'square', freq: 1175, dur: 0.12, vol: 0.08, delay: 0.06 });
        break;
      case 'buy':
        [659, 988, 1319].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.1, vol: 0.08, delay: i * 0.05 }));
        break;
      case 'denied':
        this.tone({ type: 'square', freq: 160, dur: 0.18, vol: 0.1 });
        break;
      case 'victory':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
          this.tone({ type: 'square', freq: f, dur: 0.22, vol: 0.1, delay: i * 0.13 }));
        break;
      case 'synergy':
        [440, 554, 659, 880, 1109].forEach((f, i) => this.tone({ type: 'sawtooth', freq: f, dur: 0.25, vol: 0.06, delay: i * 0.04, vib: 8 }));
        break;
      case 'vacuum':
        this.tone({ type: 'sine', freq: 200, to: 1600, dur: 0.5, vol: 0.12 });
        break;
    }
  }

  // ------------------------------------------------------------ music

  /** Starts a looping procedural chiptune (bass + arpeggio + drums). */
  startMusic(): void {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    const tick = () => {
      if (!this.ctx || !this.musicPlaying) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
        this.scheduleStep(this.step, this.nextNoteTime);
        this.step++;
        this.nextNoteTime += 60 / 132 / 4; // 16th notes at 132 BPM
      }
    };
    this.musicTimer = window.setInterval(tick, 25);
    tick();
  }

  stopMusic(): void {
    this.musicPlaying = false;
    window.clearInterval(this.musicTimer);
  }

  private scheduleStep(step: number, t: number): void {
    const ctx = this.ctx!;
    if (!this.musicOn) return;
    // A minor: Am - F - C - G, one bar each.
    const roots = [45, 41, 48, 43];
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = roots[bar];
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const note = (type: Wave, freq: number, dur: number, vol: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.musicBus);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    };
    const drum = (freq: number, to: number, dur: number, vol: number, noise: boolean) => {
      if (noise) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(this.musicBus);
        src.start(t, Math.random() * 0.5);
        src.stop(t + dur + 0.02);
      } else {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(to, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(this.musicBus);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    };
    const combat = this.intensity > 0.5;
    // Bass: driving 8ths in combat, whole notes in the menu.
    if (combat ? s % 2 === 0 : s === 0) note('triangle', midi(root - 12 + (s === 6 || s === 14 ? 12 : 0)), combat ? 0.2 : 1.6, 0.35);
    if (combat) {
      if (s % 4 === 0) drum(150, 45, 0.18, 0.5, false);
      if (s % 8 === 4) drum(1800, 0, 0.12, 0.18, true);
      if (s % 2 === 1) drum(8000, 0, 0.03, 0.05, true);
    }
    // Arpeggio over the minor / major triad.
    const minor = bar === 0;
    const chord = [0, minor ? 3 : 4, 7, 12];
    if (combat || s % 4 === 0) {
      const n = root + 12 + chord[(s + Math.floor(s / 4)) % 4];
      note('square', midi(n + 12), 0.09, combat ? 0.05 : 0.035);
    }
  }
}
