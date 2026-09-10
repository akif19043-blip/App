/**
 * Driver rank: the career the coins do not describe.
 *
 * Money in this game is spent the moment you have it -- on a car, on parts,
 * on a repair -- so it is a terrible record of what you have done. Rank is
 * the record: it only ever goes up, it decides which jobs the city offers
 * you, and it lifts the rate every fee is paid at.
 *
 * Everything here is a pure function of the saved profile, so the HUD, the
 * garage and the session can all ask the same questions without any of them
 * owning the answer.
 */

import * as save from './save.js';
import { RANKS, XP } from './config.js';

/** The rank a given amount of experience has reached. */
export function rankFor(xp) {
  let found = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.xp) found = rank;
  }
  return found;
}

/** The next rank up, or null at the top. */
export function nextRank(xp) {
  return RANKS.find((rank) => rank.xp > xp) || null;
}

/** How far through the current rank, 0..1. Full at the top rank. */
export function rankProgress(xp) {
  const here = rankFor(xp);
  const next = nextRank(xp);
  if (!next) return 1;
  return Math.max(0, Math.min(1, (xp - here.xp) / (next.xp - here.xp)));
}

/** Job type ids this much experience has opened. */
export function unlockedJobs(xp) {
  const open = new Set(['delivery']);
  for (const rank of RANKS) {
    if (xp >= rank.xp && rank.job) open.add(rank.job);
  }
  return open;
}

/** Multiplier applied to every fee, from rank alone. */
export function payRate(xp) {
  return 1 + rankFor(xp).payBonus;
}

/**
 * What a finished job is worth in experience.
 *
 * @param {{stops:{length:number}}} mission
 * @param {boolean} onTime
 * @param {boolean} clean   finished without hitting anything
 */
export function jobXp(mission, onTime, clean) {
  return Math.round(XP.perJob * mission.stops.length
    + (onTime ? XP.onTime : 0)
    + (clean ? XP.cleanJob : 0));
}

/**
 * Bank experience and say whether it moved the driver up.
 *
 * @returns {{xp:number, rank:object, promoted:boolean}}
 */
export function award(amount) {
  const before = rankFor(save.get().xp || 0);
  const xp = save.addXp(Math.max(0, Math.round(amount)));
  const rank = rankFor(xp);
  return { xp, rank, promoted: rank.id > before.id };
}
