import { MIN_COOLDOWN_MULT, type PlayerStats } from '../game/stats';
import { effectiveCooldown, scaledDamage } from './damage';

export type WeaponId = 'wand' | 'orbs' | 'lightning' | 'daggers' | 'aura';

export const MAX_WEAPONS = 4;
export const MAX_WEAPON_LEVEL = 8;

/** Raw weapon numbers before the player's stats are applied. */
export interface WeaponBase {
  damage: number;
  /** Seconds between activations. */
  cooldown: number;
  /** Projectiles / orbs / strikes per activation. */
  amount: number;
  /** Size in world units (projectile radius, orbit radius, blast radius...). */
  area: number;
  /** Projectile speed (or orbit angular speed for orbs). */
  speed: number;
  /** Extra enemies a projectile passes through. */
  pierce: number;
  /** Ricochets after the first hit. */
  bounces: number;
  knockback: number;
}

/** A level-up step. Numbers add, `*Mult` fields multiply. */
export interface LevelStep {
  text: string;
  damage?: number;
  cooldownMult?: number;
  amount?: number;
  areaMult?: number;
  speedMult?: number;
  pierce?: number;
  bounces?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  color: string;
  desc: string;
  base: WeaponBase;
  /** Steps for levels 2..MAX_WEAPON_LEVEL. */
  steps: readonly LevelStep[];
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  wand: {
    id: 'wand',
    name: 'Magic Wand',
    icon: '✧',
    color: '#5ef2ff',
    desc: 'Fires rapid bolts at the nearest enemy.',
    base: { damage: 10, cooldown: 0.75, amount: 1, area: 6, speed: 620, pierce: 0, bounces: 0, knockback: 90 },
    steps: [
      { text: '+1 bolt', amount: 1 },
      { text: '+5 damage', damage: 5 },
      { text: '-15% cooldown', cooldownMult: 0.85 },
      { text: '+1 pierce', pierce: 1 },
      { text: '+1 bolt', amount: 1 },
      { text: '+6 damage', damage: 6 },
      { text: '+1 bolt, +1 pierce', amount: 1, pierce: 1 },
    ],
  },
  orbs: {
    id: 'orbs',
    name: 'Spinning Orbs',
    icon: '◉',
    color: '#b56bff',
    desc: 'Orbs circle you, shredding anything they touch.',
    base: { damage: 12, cooldown: 0.45, amount: 2, area: 95, speed: 3.2, pierce: 0, bounces: 0, knockback: 160 },
    steps: [
      { text: '+1 orb', amount: 1 },
      { text: '+25% orbit size', areaMult: 1.25 },
      { text: '+6 damage', damage: 6 },
      { text: '+1 orb', amount: 1 },
      { text: '+30% spin speed', speedMult: 1.3 },
      { text: '+8 damage', damage: 8 },
      { text: '+2 orbs', amount: 2 },
    ],
  },
  lightning: {
    id: 'lightning',
    name: 'Chain Lightning',
    icon: 'ϟ',
    color: '#fff36b',
    desc: 'Calls down bolts on random enemies, blasting nearby foes.',
    base: { damage: 22, cooldown: 1.9, amount: 2, area: 70, speed: 0, pierce: 0, bounces: 0, knockback: 120 },
    steps: [
      { text: '+1 strike', amount: 1 },
      { text: '+10 damage', damage: 10 },
      { text: '+25% blast radius', areaMult: 1.25 },
      { text: '+1 strike', amount: 1 },
      { text: '-15% cooldown', cooldownMult: 0.85 },
      { text: '+12 damage', damage: 12 },
      { text: '+2 strikes', amount: 2 },
    ],
  },
  daggers: {
    id: 'daggers',
    name: 'Ricochet Daggers',
    icon: '➶',
    color: '#ff8a3d',
    desc: 'Thrown blades that bounce between enemies.',
    base: { damage: 14, cooldown: 1.2, amount: 1, area: 7, speed: 700, pierce: 0, bounces: 2, knockback: 60 },
    steps: [
      { text: '+1 bounce', bounces: 1 },
      { text: '+1 dagger', amount: 1 },
      { text: '+6 damage', damage: 6 },
      { text: '+2 bounces', bounces: 2 },
      { text: '-15% cooldown', cooldownMult: 0.85 },
      { text: '+1 dagger', amount: 1 },
      { text: '+8 damage, +2 bounces', damage: 8, bounces: 2 },
    ],
  },
  aura: {
    id: 'aura',
    name: 'Nova Field',
    icon: '✺',
    color: '#4dff9d',
    desc: 'A pulsing field that burns and slows nearby enemies.',
    base: { damage: 6, cooldown: 0.5, amount: 1, area: 80, speed: 0, pierce: 0, bounces: 0, knockback: 25 },
    steps: [
      { text: '+20% radius', areaMult: 1.2 },
      { text: '+3 damage', damage: 3 },
      { text: '-15% pulse time', cooldownMult: 0.85 },
      { text: '+20% radius', areaMult: 1.2 },
      { text: '+4 damage', damage: 4 },
      { text: '+20% radius', areaMult: 1.2 },
      { text: '+6 damage, -15% pulse time', damage: 6, cooldownMult: 0.85 },
    ],
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** Weapon numbers after its level and the player's stats are applied. */
export interface ResolvedWeapon {
  damage: number;
  cooldown: number;
  amount: number;
  area: number;
  speed: number;
  pierce: number;
  bounces: number;
  knockback: number;
}

/** Stats of `id` at `level` (1-based) before player stats. */
export function weaponBaseAtLevel(id: WeaponId, level: number): WeaponBase {
  const def = WEAPONS[id];
  const lv = Math.max(1, Math.min(MAX_WEAPON_LEVEL, Math.floor(level)));
  const b: WeaponBase = { ...def.base };
  for (let i = 0; i < lv - 1; i++) {
    const s = def.steps[i];
    if (s.damage) b.damage += s.damage;
    if (s.cooldownMult) b.cooldown *= s.cooldownMult;
    if (s.amount) b.amount += s.amount;
    if (s.areaMult) b.area *= s.areaMult;
    if (s.speedMult) b.speed *= s.speedMult;
    if (s.pierce) b.pierce += s.pierce;
    if (s.bounces) b.bounces += s.bounces;
  }
  return b;
}

/** Fully resolved weapon stats: level steps, then player stats. */
export function resolveWeapon(id: WeaponId, level: number, stats: Readonly<PlayerStats>): ResolvedWeapon {
  const b = weaponBaseAtLevel(id, level);
  // The aura is one field, so Multishot does not add to it.
  const extra = id === 'aura' ? 0 : stats.amount;
  const projectile = id === 'wand' || id === 'daggers';
  return {
    damage: scaledDamage(b.damage, stats.might),
    cooldown: effectiveCooldown(b.cooldown, stats.cooldown, MIN_COOLDOWN_MULT),
    amount: b.amount + extra,
    area: b.area * stats.area,
    speed: projectile ? b.speed * stats.projSpeed : b.speed,
    pierce: b.pierce,
    bounces: b.bounces,
    knockback: b.knockback,
  };
}

/** Pairs of weapons that unlock a bonus when both reach SYNERGY_LEVEL. */
export type SynergyId = 'arcaneRicochet' | 'stormOrbs' | 'novaCore' | 'thunderBlades';
export const SYNERGY_LEVEL = 3;

export interface SynergyDef {
  id: SynergyId;
  name: string;
  desc: string;
  a: WeaponId;
  b: WeaponId;
}

export const SYNERGIES: readonly SynergyDef[] = [
  { id: 'arcaneRicochet', name: 'Arcane Ricochet', desc: 'Wand bolts ricochet to a second target.', a: 'wand', b: 'daggers' },
  { id: 'stormOrbs', name: 'Storm Orbs', desc: 'Orb hits can call down lightning.', a: 'orbs', b: 'lightning' },
  { id: 'novaCore', name: 'Nova Core', desc: 'Orbs grow 30% larger and hit 25% harder.', a: 'orbs', b: 'aura' },
  { id: 'thunderBlades', name: 'Thunder Blades', desc: 'Dagger bounces discharge sparks for bonus damage.', a: 'daggers', b: 'lightning' },
];

/** Synergies active for a loadout of (weapon, level) pairs. */
export function activeSynergies(loadout: ReadonlyArray<{ id: WeaponId; level: number }>): SynergyId[] {
  const lv = (id: WeaponId) => loadout.find((w) => w.id === id)?.level ?? 0;
  return SYNERGIES.filter((s) => lv(s.a) >= SYNERGY_LEVEL && lv(s.b) >= SYNERGY_LEVEL).map((s) => s.id);
}
