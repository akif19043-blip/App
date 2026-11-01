/**
 * The player's profile: gold, records, shop levels, settings.
 *
 * Stored through the portal (CrazyGames keeps it with the player's account
 * when they are signed in) or in localStorage elsewhere. Every read is
 * guarded: a profile that will not parse is a fresh start, never a crash.
 */

import * as portal from './portal.js';
import { META } from './config.js';

const KEY = 'glowfly.v1';

const DEFAULTS = {
  gold: 0,
  best: 0,           // longest night survived, seconds
  bestLevel: 0,
  runs: 0,
  dawns: 0,
  kills: 0,
  meta: {},          // shop id -> level
  freeGoldAt: 0,     // ms since epoch the free-gold ad last paid
  settings: { sound: true, music: true, numbers: true, language: null },
};

let profile = clone(DEFAULTS);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function load() {
  try {
    const raw = portal.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      profile = Object.assign(clone(DEFAULTS), parsed);
      profile.settings = Object.assign(clone(DEFAULTS.settings), parsed.settings || {});
      profile.meta = (parsed.meta && typeof parsed.meta === 'object') ? parsed.meta : {};
      for (const key of ['gold', 'best', 'bestLevel', 'runs', 'dawns', 'kills', 'freeGoldAt']) {
        profile[key] = Math.max(0, Number(profile[key]) || 0);
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
    portal.setItem(KEY, JSON.stringify(profile));
  } catch (err) {
    /* storage refused: the session still plays, it just will not persist */
  }
  return profile;
}

export function get() {
  return profile;
}

export function addGold(amount) {
  profile.gold = Math.max(0, Math.round(profile.gold + amount));
  save();
  return profile.gold;
}

export function metaLevel(id) {
  return Math.max(0, Math.min(META[id].cost.length, Number(profile.meta[id]) || 0));
}

/** Price of the next level of a shop item, or null when it is maxed. */
export function metaCost(id) {
  const level = metaLevel(id);
  return level >= META[id].cost.length ? null : META[id].cost[level];
}

export function buyMeta(id) {
  const cost = metaCost(id);
  if (cost === null || profile.gold < cost) return false;
  profile.gold -= cost;
  profile.meta[id] = metaLevel(id) + 1;
  save();
  return true;
}

/** Shop levels as the run wants them. */
export function metaLevels() {
  const levels = {};
  for (const id of Object.keys(META)) levels[id] = metaLevel(id);
  return levels;
}

/**
 * @param {{time:number, level:number, kills:number, won:boolean}} summary
 * @param {boolean} newRun false when a revived run is being recorded again
 * @returns {boolean} true if this was a new best
 */
export function recordRun(summary, newRun = true) {
  const best = summary.time > profile.best;
  if (newRun) profile.runs += 1;
  profile.best = Math.max(profile.best, Math.floor(summary.time));
  profile.bestLevel = Math.max(profile.bestLevel, summary.level);
  if (summary.won) profile.dawns += 1;
  save();
  return best;
}

export function addKills(count) {
  profile.kills += count;
}

export function setSetting(key, value) {
  profile.settings[key] = value;
  save();
}

export function markFreeGold(now = Date.now()) {
  profile.freeGoldAt = now;
  save();
}
