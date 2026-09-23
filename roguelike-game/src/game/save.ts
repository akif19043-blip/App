import { META_UPGRADES, type MetaId, type MetaRanks, metaCost } from './meta';
import { type RunResult, runScore } from './progression';

/** Persistent profile stored in localStorage. */
export interface SaveData {
  version: 1;
  gold: number;
  totalGold: number;
  runs: number;
  best: { time: number; kills: number; level: number; score: number };
  victories: number;
  meta: MetaRanks;
  top: Array<RunResult & { score: number; date: number }>;
  settings: { sfx: boolean; music: boolean; shake: boolean };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'neon-swarm-save-v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    gold: 0,
    totalGold: 0,
    runs: 0,
    best: { time: 0, kills: 0, level: 0, score: 0 },
    victories: 0,
    meta: {},
    top: [],
    settings: { sfx: true, music: true, shake: true },
  };
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Loads and validates the save; any corrupt field falls back to its default. */
export function loadSave(storage: StorageLike | null): SaveData {
  const d = defaultSave();
  if (!storage) return d;
  let raw: unknown;
  try {
    const text = storage.getItem(SAVE_KEY);
    if (!text) return d;
    raw = JSON.parse(text);
  } catch {
    return d;
  }
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, any>;
  d.gold = Math.floor(num(r.gold, 0));
  d.totalGold = Math.floor(num(r.totalGold, d.gold));
  d.runs = Math.floor(num(r.runs, 0));
  d.victories = Math.floor(num(r.victories, 0));
  const b = r.best && typeof r.best === 'object' ? r.best : {};
  d.best = { time: num(b.time, 0), kills: num(b.kills, 0), level: num(b.level, 0), score: num(b.score, 0) };
  if (r.meta && typeof r.meta === 'object') {
    for (const m of META_UPGRADES) {
      const v = Math.floor(num(r.meta[m.id], 0));
      if (v > 0) d.meta[m.id] = Math.min(v, m.maxRank);
    }
  }
  if (Array.isArray(r.top)) {
    d.top = r.top
      .filter((t: any) => t && typeof t === 'object' && Number.isFinite(t.score))
      .slice(0, 5)
      .map((t: any) => ({
        time: num(t.time, 0), kills: num(t.kills, 0), level: num(t.level, 0), gold: num(t.gold, 0),
        victory: bool(t.victory, false), score: num(t.score, 0), date: num(t.date, 0),
      }));
  }
  const s = r.settings && typeof r.settings === 'object' ? r.settings : {};
  d.settings = { sfx: bool(s.sfx, true), music: bool(s.music, true), shake: bool(s.shake, true) };
  return d;
}

export function writeSave(storage: StorageLike | null, data: SaveData): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked (private mode): the game still works, it just forgets.
  }
}

/** Attempts to buy the next rank of a meta upgrade. Returns true on success. */
export function buyMeta(data: SaveData, id: MetaId): boolean {
  const rank = data.meta[id] ?? 0;
  const cost = metaCost(id, rank);
  if (!Number.isFinite(cost) || data.gold < cost) return false;
  data.gold -= cost;
  data.meta[id] = rank + 1;
  return true;
}

export interface RecordFlags {
  score: boolean;
  time: boolean;
  kills: boolean;
  level: boolean;
}

/** Banks a finished run into the profile and reports which records it broke. */
export function recordRun(data: SaveData, run: RunResult, now = Date.now()): { score: number; records: RecordFlags } {
  const score = runScore(run);
  const records: RecordFlags = {
    score: score > data.best.score,
    time: run.time > data.best.time,
    kills: run.kills > data.best.kills,
    level: run.level > data.best.level,
  };
  data.runs++;
  if (run.victory) data.victories++;
  data.gold += run.gold;
  data.totalGold += run.gold;
  data.best = {
    score: Math.max(data.best.score, score),
    time: Math.max(data.best.time, run.time),
    kills: Math.max(data.best.kills, run.kills),
    level: Math.max(data.best.level, run.level),
  };
  data.top.push({ ...run, score, date: now });
  data.top.sort((a, b) => b.score - a.score);
  data.top.length = Math.min(data.top.length, 5);
  return { score, records };
}
