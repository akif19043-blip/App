/**
 * Persistent profile: best score, coins, characters, upgrades, missions and
 * settings. localStorage can throw (private windows, blocked site data), so
 * every access is guarded and the game falls back to memory.
 */

const KEY = 'sicra.profile.v1';

const DEFAULTS = {
  best: 0,
  bestDistance: 0,
  coins: 0,
  runs: 0,
  totalDistance: 0,
  totalCoins: 0,
  character: 'ekin',
  owned: ['ekin'],
  upgrades: { magnet: 1, shield: 1, wings: 1 },
  missions: { active: [], completedSets: 0, completedCount: 0 },
  seenTutorial: false,
  settings: {
    sound: true,
    music: true,
    vibrate: true,
    language: null,     // null = follow the device on first run
    quality: 'high',
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, extra) {
  const out = clone(base);
  if (!extra || typeof extra !== 'object') return out;
  for (const key of Object.keys(extra)) {
    const value = extra[key];
    if (value && typeof value === 'object' && !Array.isArray(value)
        && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = merge(out[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

let profile = null;

export function load() {
  if (profile) return profile;
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (err) { /* storage blocked */ }
  let parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch (err) { parsed = null; }
  }
  profile = merge(DEFAULTS, parsed);
  return profile;
}

export function save() {
  if (!profile) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch (err) { /* storage blocked; the session still works */ }
}

export function reset() {
  profile = clone(DEFAULTS);
  try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
  save();
  return profile;
}

export function get() {
  return profile || load();
}
