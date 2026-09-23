import { type PlayerStats, cloneStats } from './stats';

/** Permanent upgrades bought with gold in the main-menu shop. */
export type MetaId = 'maxHp' | 'speed' | 'magnet' | 'might' | 'armor' | 'growth' | 'greed' | 'reroll';

export interface MetaDef {
  id: MetaId;
  name: string;
  desc: string;
  icon: string;
  maxRank: number;
  baseCost: number;
  growth: number;
}

export const META_UPGRADES: readonly MetaDef[] = [
  { id: 'maxHp', name: 'Vital Core', desc: '+12 Max HP', icon: '♥', maxRank: 5, baseCost: 60, growth: 1.6 },
  { id: 'speed', name: 'Thrusters', desc: '+5% move speed', icon: '»', maxRank: 5, baseCost: 70, growth: 1.6 },
  { id: 'magnet', name: 'Gravity Well', desc: '+15% pickup radius', icon: '◎', maxRank: 5, baseCost: 50, growth: 1.55 },
  { id: 'might', name: 'Overclock', desc: '+6% damage', icon: '✦', maxRank: 5, baseCost: 90, growth: 1.7 },
  { id: 'armor', name: 'Plating', desc: '+1 armor', icon: '⬢', maxRank: 3, baseCost: 150, growth: 2 },
  { id: 'growth', name: 'Insight', desc: '+6% XP gain', icon: '▲', maxRank: 5, baseCost: 80, growth: 1.65 },
  { id: 'greed', name: 'Greed', desc: '+12% gold gain', icon: '¤', maxRank: 5, baseCost: 60, growth: 1.6 },
  { id: 'reroll', name: 'Fate Dice', desc: '+1 card reroll per run', icon: '↻', maxRank: 3, baseCost: 120, growth: 2.2 },
];

export type MetaRanks = Partial<Record<MetaId, number>>;

export function metaDef(id: MetaId): MetaDef {
  const d = META_UPGRADES.find((m) => m.id === id);
  if (!d) throw new Error(`Unknown meta upgrade ${id}`);
  return d;
}

/** Gold cost to buy the next rank when currently at `rank`. */
export function metaCost(id: MetaId, rank: number): number {
  const d = metaDef(id);
  if (rank >= d.maxRank) return Infinity;
  return Math.round(d.baseCost * Math.pow(d.growth, rank));
}

/** Starting stats for a run once permanent upgrades are applied. */
export function applyMeta(base: Readonly<PlayerStats>, ranks: MetaRanks): PlayerStats {
  const r = (id: MetaId) => Math.min(ranks[id] ?? 0, metaDef(id).maxRank);
  const s = cloneStats(base);
  s.maxHp += 12 * r('maxHp');
  s.moveSpeed *= 1 + 0.05 * r('speed');
  s.magnet *= 1 + 0.15 * r('magnet');
  s.might *= 1 + 0.06 * r('might');
  s.armor += r('armor');
  s.xpGain *= 1 + 0.06 * r('growth');
  s.greed *= 1 + 0.12 * r('greed');
  return s;
}

export function startingRerolls(ranks: MetaRanks): number {
  return 1 + Math.min(ranks.reroll ?? 0, metaDef('reroll').maxRank);
}
