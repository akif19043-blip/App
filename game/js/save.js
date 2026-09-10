/**
 * Persistent profile: best score, coin balance, unlocked cars, settings.
 *
 * localStorage can throw (private windows, blocked site data), so every access
 * is guarded and the game falls back to an in-memory profile rather than
 * refusing to start.
 */

const KEY = 'kumtepe-racer.profile.v1';

const DEFAULTS = {
  best: 0,
  bestDistance: 0,
  coins: 0,
  runs: 0,
  selectedCar: 'sport',
  owned: ['sport'],
  upgrades: {},          // carId -> { engine: 0, gearbox: 0, ... }
  paint: {},             // carId -> '#rrggbb'
  settings: {
    sound: true,
    autoThrottle: false,   // free roam wants a real throttle you can lift off
    tilt: false,
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

export function setPaint(carId, color) {
  profile.paint[carId] = color;
  return save();
}

export function setSetting(key, value) {
  profile.settings[key] = value;
  return save();
}
