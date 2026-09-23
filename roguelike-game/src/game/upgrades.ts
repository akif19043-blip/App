import { type Rng } from '../engine/rng';
import { MAX_WEAPONS, MAX_WEAPON_LEVEL, WEAPONS, WEAPON_IDS, type WeaponId } from '../weapons/defs';
import { type PlayerStats } from './stats';

/** In-run passive upgrades offered on level-up cards. */
export type PassiveId =
  | 'might' | 'haste' | 'swift' | 'vitality' | 'magnet' | 'area'
  | 'multishot' | 'regen' | 'armor' | 'crit' | 'growth' | 'velocity';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string;
  icon: string;
  maxRank: number;
  weight: number;
  apply(s: PlayerStats): void;
}

export const PASSIVES: readonly PassiveDef[] = [
  { id: 'might', name: 'Power Cell', desc: '+12% damage', icon: '✦', maxRank: 5, weight: 1, apply: (s) => { s.might *= 1.12; } },
  { id: 'haste', name: 'Haste Chip', desc: '-8% weapon cooldowns', icon: '⌛', maxRank: 5, weight: 1, apply: (s) => { s.cooldown *= 0.92; } },
  { id: 'swift', name: 'Hover Boots', desc: '+10% move speed', icon: '»', maxRank: 4, weight: 0.8, apply: (s) => { s.moveSpeed *= 1.1; } },
  { id: 'vitality', name: 'Bio Plating', desc: '+25 Max HP and heal 25', icon: '♥', maxRank: 5, weight: 0.9, apply: (s) => { s.maxHp += 25; } },
  { id: 'magnet', name: 'Attractor', desc: '+35% pickup radius', icon: '◎', maxRank: 4, weight: 0.8, apply: (s) => { s.magnet *= 1.35; } },
  { id: 'area', name: 'Amplifier', desc: '+12% weapon area', icon: '◈', maxRank: 5, weight: 0.9, apply: (s) => { s.area *= 1.12; } },
  { id: 'multishot', name: 'Splitter', desc: '+1 projectile for every weapon', icon: '⁂', maxRank: 2, weight: 0.35, apply: (s) => { s.amount += 1; } },
  { id: 'regen', name: 'Nanobots', desc: '+0.4 HP regenerated per second', icon: '✚', maxRank: 5, weight: 0.8, apply: (s) => { s.regen += 0.4; } },
  { id: 'armor', name: 'Deflector', desc: '+1 armor (less damage per hit)', icon: '⬢', maxRank: 5, weight: 0.8, apply: (s) => { s.armor += 1; } },
  { id: 'crit', name: 'Targeting AI', desc: '+7% critical chance', icon: '⌖', maxRank: 5, weight: 0.8, apply: (s) => { s.crit += 0.07; } },
  { id: 'growth', name: 'Data Siphon', desc: '+12% XP gain', icon: '▲', maxRank: 4, weight: 0.7, apply: (s) => { s.xpGain *= 1.12; } },
  { id: 'velocity', name: 'Railgun Coil', desc: '+20% projectile speed', icon: '➤', maxRank: 3, weight: 0.5, apply: (s) => { s.projSpeed *= 1.2; } },
];

export function passiveDef(id: PassiveId): PassiveDef {
  const d = PASSIVES.find((p) => p.id === id);
  if (!d) throw new Error(`Unknown passive ${id}`);
  return d;
}

export type Rarity = 'common' | 'rare' | 'epic';

export type Card =
  | { kind: 'weapon'; id: WeaponId; level: number; title: string; desc: string; icon: string; color: string; rarity: Rarity }
  | { kind: 'passive'; id: PassiveId; level: number; title: string; desc: string; icon: string; color: string; rarity: Rarity }
  | { kind: 'heal' | 'gold'; title: string; desc: string; icon: string; color: string; rarity: Rarity; level: 0 };

export interface Loadout {
  weapons: ReadonlyArray<{ id: WeaponId; level: number }>;
  passives: Readonly<Partial<Record<PassiveId, number>>>;
}

const PASSIVE_COLOR = '#ffd166';

/** Every card the loadout could legally take right now, with its weight. */
export function candidateCards(loadout: Loadout): Array<{ card: Card; weight: number }> {
  const out: Array<{ card: Card; weight: number }> = [];
  const owned = new Map(loadout.weapons.map((w) => [w.id, w.level]));
  for (const id of WEAPON_IDS) {
    const def = WEAPONS[id];
    const lv = owned.get(id);
    if (lv === undefined) {
      if (owned.size >= MAX_WEAPONS) continue;
      out.push({
        card: { kind: 'weapon', id, level: 1, title: def.name, desc: def.desc, icon: def.icon, color: def.color, rarity: 'rare' },
        // Push new weapons hard early so builds take shape quickly.
        weight: owned.size < 2 ? 2.2 : 1.1,
      });
    } else if (lv < MAX_WEAPON_LEVEL) {
      const next = lv + 1;
      out.push({
        card: {
          kind: 'weapon', id, level: next, title: def.name, desc: def.steps[lv - 1].text,
          icon: def.icon, color: def.color, rarity: next === MAX_WEAPON_LEVEL ? 'epic' : 'common',
        },
        weight: 1.5,
      });
    }
  }
  for (const p of PASSIVES) {
    const rank = loadout.passives[p.id] ?? 0;
    if (rank >= p.maxRank) continue;
    out.push({
      card: {
        kind: 'passive', id: p.id, level: rank + 1, title: p.name, desc: p.desc, icon: p.icon, color: PASSIVE_COLOR,
        rarity: p.id === 'multishot' ? 'epic' : 'common',
      },
      weight: p.weight,
    });
  }
  return out;
}

/**
 * Draws `count` distinct upgrade cards by weight. When everything is maxed,
 * falls back to heal / gold cards so a level-up is never empty.
 */
export function rollCards(loadout: Loadout, rng: Rng, count = 3): Card[] {
  const pool = candidateCards(loadout);
  const picked: Card[] = [];
  while (picked.length < count && pool.length > 0) {
    const i = rng.weighted(pool.map((p) => p.weight));
    picked.push(pool[i].card);
    pool.splice(i, 1);
  }
  const fillers: Card[] = [
    { kind: 'heal', title: 'Repair Kit', desc: 'Restore 40% HP', icon: '✚', color: '#4dff9d', rarity: 'common', level: 0 },
    { kind: 'gold', title: 'Gold Cache', desc: '+30 gold', icon: '¤', color: '#ffd166', rarity: 'common', level: 0 },
  ];
  for (const f of fillers) if (picked.length < count) picked.push(f);
  return picked;
}
