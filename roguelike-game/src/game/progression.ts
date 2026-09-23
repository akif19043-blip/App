/** XP curve, level-up bookkeeping and run scoring. Pure functions only. */

/**
 * XP required to go from `level` to `level + 1`.
 * Early levels come fast (5, 13, 22...) to hook the player, then the curve
 * steepens quadratically so late-game levels stay meaningful.
 */
export function xpToNext(level: number): number {
  if (level < 1) throw new RangeError('level must be >= 1');
  const n = level - 1;
  return Math.round(5 + 8 * n + 0.6 * n * n);
}

/** Total XP needed to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpToNext(l);
  return sum;
}

export interface XpState {
  level: number;
  /** XP accumulated towards the next level. */
  xp: number;
}

/**
 * Adds XP, rolling over into as many levels as the amount covers.
 * Mutates `state` and returns the number of levels gained.
 */
export function addXp(state: XpState, amount: number): number {
  if (!(amount > 0)) return 0;
  state.xp += amount;
  let gained = 0;
  let need = xpToNext(state.level);
  while (state.xp >= need) {
    state.xp -= need;
    state.level++;
    gained++;
    need = xpToNext(state.level);
  }
  return gained;
}

/** Fraction of the way to the next level, in [0, 1). */
export function xpProgress(state: XpState): number {
  return state.xp / xpToNext(state.level);
}

export interface RunResult {
  time: number;
  kills: number;
  level: number;
  gold: number;
  victory: boolean;
}

export function runScore(r: RunResult): number {
  return Math.floor(r.kills * 10 + r.time * 5 + r.level * 100 + r.gold * 2 + (r.victory ? 25000 : 0));
}
