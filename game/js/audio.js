/**
 * All sound is synthesised with the Web Audio API -- no audio files ship with
 * the game. The engine is two detuned saws through a lowpass whose pitch and
 * cutoff track road speed; everything else is a short one-shot.
 *
 * Browsers block audio until a user gesture, so nothing is created until
 * `unlock()` is called from a real tap.
 */

let ctx = null;
let master = null;
let engine = null;
let enabled = true;

function now() {
  return ctx ? ctx.currentTime : 0;
}

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
    master.gain.value = enabled ? 0.9 : 0.0;
    master.connect(ctx.destination);
  } catch (err) {
    console.warn('audio unavailable', err);
    ctx = null;
    return false;
  }
  return true;
}

export function setEnabled(value) {
  enabled = value;
  if (master) master.gain.setTargetAtTime(value ? 0.9 : 0.0, now(), 0.05);
}

export function isEnabled() {
  return enabled;
}

/** Start the looping engine tone. Safe to call repeatedly. */
export function startEngine() {
  if (!ctx || engine) return;
  const gain = ctx.createGain();
  gain.gain.value = 0.0;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  filter.Q.value = 3.5;

  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = 'sawtooth';
  b.type = 'sawtooth';
  b.detune.value = 14;

  // A little noise gives the exhaust some grit instead of a pure tone.
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.05;

  a.connect(filter);
  b.connect(filter);
  noise.connect(noiseGain).connect(filter);
  filter.connect(gain).connect(master);

  a.start();
  b.start();
  noise.start();
  engine = { a, b, gain, filter, noiseGain };
}

export function stopEngine() {
  if (!engine) return;
  const { a, b, gain } = engine;
  gain.gain.setTargetAtTime(0.0, now(), 0.08);
  const stopAt = now() + 0.4;
  try {
    a.stop(stopAt);
    b.stop(stopAt);
  } catch (err) { /* already stopped */ }
  engine = null;
}

/**
 * @param {number} throttle 0..1
 * @param {number} ratio    speed / topSpeed, 0..1
 * @param {boolean} boosting
 */
export function updateEngine(throttle, ratio, boosting) {
  if (!engine || !ctx) return;
  // Fake gearing: pitch climbs through a gear then drops on the shift.
  const gear = Math.min(5, Math.floor(ratio * 5));
  const withinGear = ratio * 5 - gear;
  const base = 58 + gear * 8 + withinGear * 64 + (boosting ? 26 : 0);
  const t = now();
  engine.a.frequency.setTargetAtTime(base, t, 0.06);
  engine.b.frequency.setTargetAtTime(base * 1.01, t, 0.06);
  engine.filter.frequency.setTargetAtTime(
    500 + ratio * 2600 + throttle * 500, t, 0.08);
  engine.gain.gain.setTargetAtTime(0.12 + throttle * 0.1 + ratio * 0.08,
                                   t, 0.1);
  engine.noiseGain.gain.setTargetAtTime(0.03 + ratio * 0.09, t, 0.1);
}

function blip({ type = 'sine', from, to, duration, gain = 0.25, delay = 0 }) {
  if (!ctx || !enabled) return;
  const t = now() + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + duration);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export function coin() {
  blip({ type: 'triangle', from: 900, to: 1500, duration: 0.10, gain: 0.16 });
  blip({ type: 'triangle', from: 1400, to: 1950, duration: 0.12, gain: 0.12,
         delay: 0.05 });
}

export function nitro() {
  blip({ type: 'sawtooth', from: 200, to: 1500, duration: 0.45, gain: 0.16 });
}

export function nearMiss() {
  blip({ type: 'sine', from: 640, to: 1180, duration: 0.14, gain: 0.10 });
}

export function crash() {
  if (!ctx || !enabled) return;
  const t = now();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.9, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade * fade;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, t);
  filter.frequency.exponentialRampToValueAtTime(180, t + 0.8);
  const amp = ctx.createGain();
  amp.gain.value = 0.85;
  source.connect(filter).connect(amp).connect(master);
  source.start(t);
  blip({ type: 'square', from: 160, to: 40, duration: 0.5, gain: 0.3 });
}

export function scrape() {
  blip({ type: 'square', from: 320, to: 260, duration: 0.10, gain: 0.06 });
}

let lastScreech = 0;

/**
 * Tyre scrub. Called every frame while the tyres are complaining; it rate
 * limits itself so a long slide is a run of overlapping bursts rather than
 * one per frame.
 *
 * @param {number} intensity 0..1
 */
export function screech(intensity) {
  if (!ctx || !enabled) return;
  const t = now();
  if (t - lastScreech < 0.22) return;
  lastScreech = t;

  const duration = 0.42;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1500 + intensity * 900, t);
  filter.frequency.linearRampToValueAtTime(950, t + duration);
  filter.Q.value = 7;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.03 + intensity * 0.10, t + 0.06);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  source.connect(filter).connect(amp).connect(master);
  source.start(t);
}

export function uiTap() {
  blip({ type: 'square', from: 520, to: 720, duration: 0.06, gain: 0.07 });
}
