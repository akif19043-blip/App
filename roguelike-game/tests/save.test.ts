import { describe, expect, it } from 'vitest';
import { META_UPGRADES, applyMeta, metaCost, startingRerolls } from '../src/game/meta';
import { SAVE_KEY, type StorageLike, buyMeta, defaultSave, loadSave, recordRun, writeSave } from '../src/game/save';
import { BASE_STATS } from '../src/game/stats';

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('meta upgrades', () => {
  it('costs grow geometrically and maxed ranks cost Infinity', () => {
    expect(metaCost('maxHp', 0)).toBe(60);
    expect(metaCost('maxHp', 1)).toBe(96);
    expect(metaCost('maxHp', 5)).toBe(Infinity);
    for (const m of META_UPGRADES) {
      for (let r = 1; r < m.maxRank; r++) expect(metaCost(m.id, r)).toBeGreaterThan(metaCost(m.id, r - 1));
    }
  });

  it('applies ranks to the starting stats without mutating the base', () => {
    const s = applyMeta(BASE_STATS, { maxHp: 2, speed: 1, magnet: 2, armor: 1 });
    expect(s.maxHp).toBe(BASE_STATS.maxHp + 24);
    expect(s.moveSpeed).toBeCloseTo(BASE_STATS.moveSpeed * 1.05);
    expect(s.magnet).toBeCloseTo(BASE_STATS.magnet * 1.3);
    expect(s.armor).toBe(1);
    expect(BASE_STATS.maxHp).toBe(100);
  });

  it('caps ranks at the maximum', () => {
    expect(applyMeta(BASE_STATS, { maxHp: 99 }).maxHp).toBe(BASE_STATS.maxHp + 12 * 5);
    expect(startingRerolls({ reroll: 99 })).toBe(4);
    expect(startingRerolls({})).toBe(1);
  });
});

describe('save data', () => {
  it('round-trips through storage', () => {
    const st = new MemStorage();
    const d = defaultSave();
    d.gold = 123;
    d.meta.magnet = 2;
    d.settings.music = false;
    writeSave(st, d);
    expect(loadSave(st)).toEqual(d);
  });

  it('survives missing, corrupt and hostile data', () => {
    const st = new MemStorage();
    expect(loadSave(null)).toEqual(defaultSave());
    expect(loadSave(st)).toEqual(defaultSave());
    st.setItem(SAVE_KEY, '{not json');
    expect(loadSave(st)).toEqual(defaultSave());
    st.setItem(SAVE_KEY, JSON.stringify({ gold: -5, meta: { maxHp: 999, bogus: 3 }, best: 'x', top: [null, { score: 5 }] }));
    const d = loadSave(st);
    expect(d.gold).toBe(0);
    expect(d.meta).toEqual({ maxHp: 5 });
    expect(d.best.score).toBe(0);
    expect(d.top).toHaveLength(1);
  });

  it('buys upgrades only when affordable', () => {
    const d = defaultSave();
    expect(buyMeta(d, 'maxHp')).toBe(false);
    d.gold = 100;
    expect(buyMeta(d, 'maxHp')).toBe(true);
    expect(d.gold).toBe(40);
    expect(d.meta.maxHp).toBe(1);
    expect(buyMeta(d, 'maxHp')).toBe(false); // costs 96 now
  });

  it('records runs, high scores and the top-5 table', () => {
    const d = defaultSave();
    const r1 = recordRun(d, { time: 120, kills: 300, level: 12, gold: 40, victory: false }, 1);
    expect(r1.records).toEqual({ score: true, time: true, kills: true, level: true });
    expect(d.gold).toBe(40);
    const r2 = recordRun(d, { time: 60, kills: 500, level: 5, gold: 10, victory: false }, 2);
    expect(r2.records.kills).toBe(true);
    expect(r2.records.time).toBe(false);
    expect(d.best.kills).toBe(500);
    expect(d.best.time).toBe(120);
    for (let i = 0; i < 10; i++) recordRun(d, { time: i, kills: i, level: 1, gold: 0, victory: false }, 3);
    expect(d.top).toHaveLength(5);
    for (let i = 1; i < d.top.length; i++) expect(d.top[i - 1].score).toBeGreaterThanOrEqual(d.top[i].score);
    expect(d.runs).toBe(12);
  });
});
