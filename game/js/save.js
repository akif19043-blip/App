/**
 * Persistent profile: best score, coin balance, unlocked cars, settings.
 *
 * localStorage can throw (private windows, blocked site data), so every access
 * is guarded and the game falls back to an in-memory profile rather than
 * refusing to start.
 */

const KEY = 'dortyol.profile.v1';

const DEFAULTS = {
  best: 0,
  bestDistance: 0,
  coins: 0,
  runs: 0,
  xp: 0,                 // driver rank is derived from this and never resets
  /**
   * Lifetime totals for the records panel. Kept separate from a run's own
   * stats: a run is thrown away when you go back to the menu, and these are
   * the only thing that says what you have actually done.
   */
  lifetime: {
    jobs: 0, onTime: 0, distance: 0, earned: 0,
    crashes: 0, busts: 0, escapes: 0, cleanJobs: 0,
  },
  selectedCar: 'sport',
  owned: ['sport'],
  seen: {},              // mode -> true once its tutorial has been shown
  upgrades: {},          // carId -> { engine: 0, gearbox: 0, ... }
  paint: {},             // carId -> '#rrggbb'
  damage: {},            // carId -> 0..1, so a crash outlives the session
  settings: {
    sound: true,
    autoThrottle: false,   // free roam wants a real throttle you can lift off
    tilt: false,
    shadows: true,
    leftHanded: false,
    music: true,
    vibrate: true,
    language: null,        // null = follow the device on first run
    quality: 'high',       // lowered automatically if the device struggles
    timeOfDay: 'auto',     // auto | day | dusk | night
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let profile = clone(DEFAULTS);

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      profile = Object.assign(clone(DEFAULTS), parsed);
      profile.settings = Object.assign(clone(DEFAULTS.settings),
                                       parsed.settings || {});
      if (!Array.isArray(profile.owned) || !profile.owned.length) {
        profile.owned = clone(DEFAULTS.owned);
      }
      if (!profile.upgrades || typeof profile.upgrades !== 'object') {
        profile.upgrades = {};
      }
      if (!profile.paint || typeof profile.paint !== 'object') {
        profile.paint = {};
      }
      if (!profile.seen || typeof profile.seen !== 'object') profile.seen = {};
      if (!profile.damage || typeof profile.damage !== 'object') {
        profile.damage = {};
      }
      profile.xp = Math.max(0, Number(profile.xp) || 0);
      profile.lifetime = Object.assign(clone(DEFAULTS.lifetime),
                                       parsed.lifetime || {});
    }
  } catch (err) {
    console.warn('profile unreadable, starting fresh', err);
    profile = clone(DEFAULTS);
  }
  return profile;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch (err) {
    /* storage unavailable: the run still works, it just will not persist */
  }
  return profile;
}

export function get() {
  return profile;
}

export function addCoins(amount) {
  profile.coins = Math.max(0, Math.round(profile.coins + amount));
  return save();
}

export function recordRun(score, distance) {
  profile.runs += 1;
  profile.best = Math.max(profile.best, Math.round(score));
  profile.bestDistance = Math.max(profile.bestDistance, Math.round(distance));
  return save();
}

/** Bank experience. Returns the new total. */
export function addXp(amount) {
  profile.xp = Math.max(0, (profile.xp || 0) + amount);
  save();
  return profile.xp;
}

/**
 * Add to the lifetime totals. Takes a partial object so a caller only names
 * what it knows about.
 */
export function recordLifetime(delta) {
  for (const [key, value] of Object.entries(delta)) {
    if (!(key in profile.lifetime)) continue;
    profile.lifetime[key] += value;
  }
  save();
  return profile.lifetime;
}

export function owns(carId) {
  return profile.owned.indexOf(carId) !== -1;
}

export function buy(car) {
  if (owns(car.id) || profile.coins < car.price) return false;
  profile.coins -= car.price;
  profile.owned.push(car.id);
  save();
  return true;
}

export function selectCar(carId) {
  if (!owns(carId)) return false;
  profile.selectedCar = carId;
  save();
  return true;
}

/** True the first time it is asked about a given key; records it afterwards. */
export function firstTime(key) {
  if (profile.seen[key]) return false;
  profile.seen[key] = true;
  save();
  return true;
}

export function upgradeLevel(carId, partId) {
  const forCar = profile.upgrades[carId];
  return (forCar && forCar[partId]) || 0;
}

export function setUpgradeLevel(carId, partId, level) {
  if (!profile.upgrades[carId]) profile.upgrades[carId] = {};
  profile.upgrades[carId][partId] = level;
  return save();
}

export function paintFor(carId, fallback) {
  return profile.paint[carId] || fallback;
}

/** How battered a car is, 0..1. Kept per car: they are repaired separately. */
export function damageFor(carId) {
  return Math.max(0, Math.min(1, profile.damage[carId] || 0));
}

export function setDamage(carId, value) {
  profile.damage[carId] = Math.max(0, Math.min(1, value));
  save();
}

export function setPaint(carId, color) {
  profile.paint[carId] = color;
  return save();
}

export function setSetting(key, value) {
  profile.settings[key] = value;
  return save();
}
