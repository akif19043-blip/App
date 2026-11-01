/**
 * Sound, all synthesised with Web Audio: no files to load, nothing to license.
 *
 * Three things can silence it and they are kept apart, so lifting one never
 * overrides another: the player's settings, an ad playing, and the portal
 * asking for quiet.
 */

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let music = null;
let soundOn = true;
let musicOn = true;
let adMuted = false;
let portalMuted = false;
let paused = false;
const lastPlayed = new Map();

export function unlock() {
  if (!ctx) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    ctx = new Context();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);
    apply();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function apply() {
  if (!ctx) return;
  const silent = adMuted || portalMuted || paused;
  master.gain.setTargetAtTime(silent ? 0 : 1, ctx.currentTime, 0.03);
  sfxBus.gain.setTargetAtTime(soundOn ? 0.55 : 0, ctx.currentTime, 0.03);
  musicBus.gain.setTargetAtTime(musicOn ? 0.32 : 0, ctx.currentTime, 0.2);
}

export function setSound(on) { soundOn = !!on; apply(); }
export function setMusic(on) { musicOn = !!on; apply(); }
export function setAdMuted(on) { adMuted = !!on; apply(); }
export function setPortalMuted(on) { portalMuted = !!on; apply(); }
/** Hidden tab: nothing should be heard from it. */
export function setPaused(on) { paused = !!on; apply(); }

export function isSilent() {
  return !ctx || adMuted || portalMuted || paused;
}

/** Skip a sound that already played within `gap` seconds: a swarm dying at
 *  once should be a crackle, not a wall of noise. */
function throttled(name, gap) {
  if (!ctx) return true;
  const now = ctx.currentTime;
  if (now - (lastPlayed.get(name) || -1) < gap) return true;
  lastPlayed.set(name, now);
  return false;
}

function tone(freq, duration, { type = 'sine', gain = 0.3, slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env);
  env.connect(sfxBus);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration, { gain = 0.2, freq = 1200, q = 1, delay = 0 } = {}) {
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.value = gain;
  source.connect(filter);
  filter.connect(env);
  env.connect(sfxBus);
  source.start(start);
}

let dewStreak = 0;
let dewAt = 0;

export const sfx = {
  spark() { if (!throttled('spark', 0.07)) tone(880, 0.07, { type: 'triangle', gain: 0.06, slide: 1.6 }); },
  hit() { if (!throttled('hit', 0.04)) noise(0.04, { gain: 0.08, freq: 2400, q: 2 }); },
  kill() { if (!throttled('kill', 0.05)) tone(220, 0.09, { type: 'square', gain: 0.05, slide: 0.5 }); },
  dew() {
    if (throttled('dew', 0.035)) return;
    // Rising pitch while the dew keeps coming, like a sweep of chimes.
    const now = ctx.currentTime;
    dewStreak = now - dewAt < 0.4 ? Math.min(dewStreak + 1, 14) : 0;
    dewAt = now;
    tone(1046 * Math.pow(2, dewStreak / 24), 0.08, { gain: 0.07 });
  },
  amber() { tone(1318, 0.09, { type: 'triangle', gain: 0.12 }); tone(1760, 0.12, { type: 'triangle', gain: 0.1, delay: 0.06 }); },
  berry() { tone(523, 0.18, { gain: 0.15, slide: 2 }); },
  level() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.16, delay: i * 0.07 })); },
  hurt() { if (!throttled('hurt', 0.15)) { tone(160, 0.18, { type: 'sawtooth', gain: 0.14, slide: 0.5 }); } },
  pulse() { noise(0.35, { gain: 0.12, freq: 500, q: 0.7 }); tone(330, 0.3, { gain: 0.08, slide: 0.5 }); },
  arc() { if (!throttled('arc', 0.1)) noise(0.12, { gain: 0.12, freq: 3800, q: 4 }); },
  spit() { if (!throttled('spit', 0.2)) tone(300, 0.1, { type: 'triangle', gain: 0.04, slide: 0.7 }); },
  death() { tone(392, 0.5, { type: 'triangle', gain: 0.2, slide: 0.4 }); tone(196, 0.7, { gain: 0.15, slide: 0.5, delay: 0.1 }); },
  revive() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.25, { gain: 0.15, delay: i * 0.06 })); },
  dawn() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.14, delay: i * 0.12 })); },
  warn() { tone(196, 0.5, { type: 'sawtooth', gain: 0.08, slide: 1.02 }); tone(185, 0.5, { type: 'sawtooth', gain: 0.08, delay: 0.25 }); },
  click() { tone(660, 0.05, { type: 'triangle', gain: 0.08 }); },
  buy() { tone(784, 0.08, { type: 'triangle', gain: 0.12 }); tone(1175, 0.14, { type: 'triangle', gain: 0.12, delay: 0.07 }); },
};

/**
 * A night pad: two slow, detuned chords under a cricket chirp. Quiet enough
 * to play under everything; it ducks with the music setting, not the sound.
 */
export function startMusic() {
  if (!ctx || music) return;
  const voices = [];
  const chord = [110, 164.81, 220, 277.18];
  for (const [i, f] of chord.entries()) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 ? 'triangle' : 'sine';
    osc.frequency.value = f;
    osc.detune.value = (i - 1.5) * 6;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.03;
    const depth = ctx.createGain();
    depth.gain.value = 0.035;
    lfo.connect(depth);
    depth.connect(gain.gain);
    osc.connect(gain);
    gain.connect(musicBus);
    osc.start();
    lfo.start();
    voices.push(osc, lfo);
  }
  const chirp = setInterval(() => {
    if (!ctx || isSilent()) return;
    const start = ctx.currentTime;
    for (let i = 0; i < 3; i += 1) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = 4200 + Math.random() * 300;
      env.gain.setValueAtTime(0.0001, start + i * 0.05);
      env.gain.exponentialRampToValueAtTime(0.012, start + i * 0.05 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.05 + 0.04);
      osc.connect(env);
      env.connect(musicBus);
      osc.start(start + i * 0.05);
      osc.stop(start + i * 0.05 + 0.05);
    }
  }, 2300);
  music = { voices, chirp };
}
