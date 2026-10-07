/**
 * All sound is synthesised with the Web Audio API; nothing is downloaded.
 * Footsteps are filtered noise bursts fired from the run cycle, pickups and
 * jumps are short oscillator sweeps, and the music is a two-voice loop
 * scheduled a little ahead of time.
 *
 * Browsers block audio until a gesture, so nothing exists until `unlock()`.
 */

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let soundOn = true;
let musicOn = true;
let noiseBuffer = null;
let music = null;

const now = () => (ctx ? ctx.currentTime : 0);

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return false;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = soundOn ? 1 : 0;
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = musicOn ? 0.35 : 0;
    musicGain.connect(master);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch (err) {
    console.warn('audio unavailable', err);
    ctx = null;
    return false;
  }
  return true;
}

export function setSound(value) {
  soundOn = !!value;
  if (sfxGain) sfxGain.gain.setTargetAtTime(soundOn ? 1 : 0, now(), 0.03);
}

export function setMusic(value) {
  musicOn = !!value;
  if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? 0.35 : 0, now(), 0.1);
}

function tone(freq, { type = 'sine', dur = 0.15, vol = 0.3, slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(sfxGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.08, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(sfxGain);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  step(speedRatio = 0) {
    noise({ dur: 0.05, vol: 0.08 + speedRatio * 0.05, freq: 500 + speedRatio * 300, q: 0.8, type: 'lowpass' });
  },
  coin(pitchStep = 0) {
    const f = 1180 * Math.pow(1.06, pitchStep % 12);
    tone(f, { type: 'triangle', dur: 0.09, vol: 0.18 });
    tone(f * 1.5, { type: 'sine', dur: 0.14, vol: 0.12, delay: 0.04 });
  },
  jump() {
    tone(320, { type: 'square', dur: 0.18, vol: 0.12, slide: 380 });
    noise({ dur: 0.12, vol: 0.06, freq: 2500, q: 0.6 });
  },
  land() {
    noise({ dur: 0.07, vol: 0.14, freq: 300, q: 0.7, type: 'lowpass' });
  },
  slide() {
    noise({ dur: 0.3, vol: 0.14, freq: 900, q: 0.5 });
  },
  lane() {
    noise({ dur: 0.08, vol: 0.05, freq: 1800, q: 0.7 });
  },
  near() {
    noise({ dur: 0.18, vol: 0.12, freq: 3200, q: 0.8 });
  },
  crash() {
    noise({ dur: 0.35, vol: 0.5, freq: 400, q: 0.4, type: 'lowpass' });
    tone(110, { type: 'sawtooth', dur: 0.4, vol: 0.25, slide: -70 });
  },
  fall() {
    tone(600, { type: 'sine', dur: 0.8, vol: 0.2, slide: -500 });
  },
  powerup() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.14, vol: 0.16, delay: i * 0.06 }));
  },
  powerdown() {
    [784, 659, 523].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.12, vol: 0.1, delay: i * 0.07 }));
  },
  shieldHit() {
    noise({ dur: 0.2, vol: 0.3, freq: 2000, q: 0.5 });
    tone(880, { type: 'sine', dur: 0.2, vol: 0.15, slide: -300 });
  },
  revive() {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'sine', dur: 0.2, vol: 0.18, delay: i * 0.08 }));
  },
  mission() {
    [659, 784, 1319].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.18, vol: 0.16, delay: i * 0.09 }));
  },
  click() {
    tone(900, { type: 'sine', dur: 0.05, vol: 0.08 });
  },
  buy() {
    [880, 1109, 1319].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.12, vol: 0.14, delay: i * 0.05 }));
  },
};

/* ------------------------------------------------------------------ music */

// A minor-key loop: bass on the root, an arpeggio above. Tempo follows run
// speed a little so the music hurries up with you.
const BASS = [55, 55, 65.4, 73.4];                       // A1 A1 C2 D2
const ARP = [
  [220, 261.6, 329.6, 440], [220, 261.6, 329.6, 440],
  [261.6, 329.6, 392, 523.3], [293.7, 349.2, 440, 587.3],
];

class Music {
  constructor() {
    this.bpm = 112;
    this.bar = 0;
    this.nextTime = 0;
    this.timer = 0;
    this.running = false;
  }

  start() {
    if (this.running || !ctx) return;
    this.running = true;
    this.nextTime = now() + 0.05;
    this.bar = 0;
    this.tick();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
  }

  setTempo(bpm) {
    this.bpm = Math.max(90, Math.min(150, bpm));
  }

  tick() {
    if (!this.running) return;
    const beat = 60 / this.bpm;
    while (this.nextTime < now() + 0.4) {
      this.scheduleBar(this.nextTime, beat);
      this.nextTime += beat * 4;
      this.bar += 1;
    }
    this.timer = setTimeout(() => this.tick(), 120);
  }

  scheduleBar(t0, beat) {
    const idx = this.bar % 4;
    const bass = ctx.createOscillator();
    const bg = ctx.createGain();
    bass.type = 'triangle';
    bass.frequency.value = BASS[idx];
    bg.gain.setValueAtTime(0.0001, t0);
    bg.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + beat * 3.6);
    bass.connect(bg).connect(musicGain);
    bass.start(t0);
    bass.stop(t0 + beat * 4);

    const notes = ARP[idx];
    for (let i = 0; i < 8; i += 1) {
      const f = notes[i % 4] * (i >= 4 ? 2 : 1);
      const t = t0 + i * beat * 0.5;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.42);
      osc.connect(g).connect(musicGain);
      osc.start(t);
      osc.stop(t + beat * 0.5);
    }
    // hat on the off-beats
    for (let i = 0; i < 4; i += 1) {
      const t = t0 + (i + 0.5) * beat;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(filter).connect(g).connect(musicGain);
      src.start(t);
      src.stop(t + 0.06);
    }
  }
}

export function startMusic() {
  if (!ctx) return;
  if (!music) music = new Music();
  music.start();
}

export function stopMusic() {
  if (music) music.stop();
}

export function setMusicTempo(bpm) {
  if (music) music.setTempo(bpm);
}
