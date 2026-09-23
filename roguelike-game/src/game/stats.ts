/** Player stat block. Multipliers are 1-based; flat values are in world units. */
export interface PlayerStats {
  maxHp: number;
  /** Movement speed in world units per second. */
  moveSpeed: number;
  /** Damage multiplier. */
  might: number;
  /** Cooldown multiplier (lower is faster). */
  cooldown: number;
  /** Area / size multiplier. */
  area: number;
  /** Extra projectiles added to every weapon. */
  amount: number;
  /** Pickup (vacuum) radius in world units. */
  magnet: number;
  /** HP regenerated per second. */
  regen: number;
  /** Flat damage reduction per hit. */
  armor: number;
  /** Critical hit chance in [0, 1]. */
  crit: number;
  /** XP gain multiplier. */
  xpGain: number;
  /** Gold gain multiplier. */
  greed: number;
  /** Projectile speed multiplier. */
  projSpeed: number;
}

export const BASE_STATS: Readonly<PlayerStats> = Object.freeze({
  maxHp: 100,
  moveSpeed: 215,
  might: 1,
  cooldown: 1,
  area: 1,
  amount: 0,
  magnet: 85,
  regen: 0,
  armor: 0,
  crit: 0.05,
  xpGain: 1,
  greed: 1,
  projSpeed: 1,
});

export const CRIT_MULTIPLIER = 2;
/** Cooldown multiplier never goes below this, however many Haste ranks. */
export const MIN_COOLDOWN_MULT = 0.35;

export function cloneStats(s: Readonly<PlayerStats>): PlayerStats {
  return { ...s };
}
