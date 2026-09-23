import { describe, expect, it } from 'vitest';
import { addXp, runScore, totalXpForLevel, xpProgress, xpToNext } from '../src/game/progression';

describe('XP curve', () => {
  it('starts with a fast first level', () => {
    expect(xpToNext(1)).toBe(5);
    expect(xpToNext(2)).toBe(14);
    expect(xpToNext(3)).toBe(23);
  });

  it('is strictly increasing and accelerating', () => {
    for (let l = 1; l < 100; l++) {
      expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
      if (l > 1) expect(xpToNext(l + 1) - xpToNext(l)).toBeGreaterThanOrEqual(xpToNext(l) - xpToNext(l - 1));
    }
  });

  it('rejects invalid levels', () => {
    expect(() => xpToNext(0)).toThrow(RangeError);
  });

  it('sums total XP per level', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(5);
    expect(totalXpForLevel(4)).toBe(5 + 14 + 23);
  });
});

describe('addXp', () => {
  it('levels up exactly at the threshold and keeps the remainder', () => {
    const s = { level: 1, xp: 0 };
    expect(addXp(s, 4)).toBe(0);
    expect(s).toEqual({ level: 1, xp: 4 });
    expect(addXp(s, 1)).toBe(1);
    expect(s).toEqual({ level: 2, xp: 0 });
    expect(addXp(s, 16)).toBe(1);
    expect(s).toEqual({ level: 3, xp: 2 });
  });

  it('rolls over multiple levels from one big gem', () => {
    const s = { level: 1, xp: 0 };
    const gained = addXp(s, totalXpForLevel(6) + 3);
    expect(gained).toBe(5);
    expect(s).toEqual({ level: 6, xp: 3 });
  });

  it('ignores non-positive or NaN amounts', () => {
    const s = { level: 3, xp: 2 };
    expect(addXp(s, 0)).toBe(0);
    expect(addXp(s, -10)).toBe(0);
    expect(addXp(s, Number.NaN)).toBe(0);
    expect(s).toEqual({ level: 3, xp: 2 });
  });

  it('reports progress as a fraction', () => {
    expect(xpProgress({ level: 1, xp: 2.5 })).toBeCloseTo(0.5);
  });
});

describe('runScore', () => {
  it('rewards every stat and a victory', () => {
    const base = { time: 100, kills: 50, level: 10, gold: 20, victory: false };
    expect(runScore(base)).toBe(500 + 500 + 1000 + 40);
    expect(runScore({ ...base, victory: true }) - runScore(base)).toBe(25000);
  });
});
