/** Damage math shared by every weapon. Pure functions, unit-tested. */
import { CRIT_MULTIPLIER } from '../game/stats';

/** Base damage after the player's Might multiplier. */
export function scaledDamage(base: number, might: number): number {
  return Math.max(0, base * might);
}

export interface DamageRoll {
  amount: number;
  crit: boolean;
}

/**
 * Rolls a hit. `roll` is a uniform random number in [0, 1); a crit happens
 * when roll < critChance and multiplies damage by CRIT_MULTIPLIER.
 * Damage is rounded to whole numbers for readable floaters (minimum 1).
 */
export function rollDamage(base: number, critChance: number, roll: number, out: DamageRoll): DamageRoll {
  const crit = roll < critChance;
  out.crit = crit;
  out.amount = Math.max(1, Math.round(crit ? base * CRIT_MULTIPLIER : base));
  return out;
}

/** Damage a player takes after flat armor; every hit deals at least 1. */
export function mitigate(raw: number, armor: number): number {
  return Math.max(1, raw - Math.max(0, armor));
}

/** Knockback speed after an enemy's resistance in [0, 1]. */
export function knockback(force: number, resist: number): number {
  const r = resist < 0 ? 0 : resist > 1 ? 1 : resist;
  return force * (1 - r);
}

/** Cooldown in seconds after the player's cooldown multiplier, clamped. */
export function effectiveCooldown(base: number, mult: number, minMult: number): number {
  return base * Math.max(minMult, mult);
}

/** Expected damage per second of a weapon, including crits (used by UI/tests). */
export function expectedDps(damage: number, cooldown: number, amount: number, critChance: number): number {
  const critFactor = 1 + Math.min(1, Math.max(0, critChance)) * (CRIT_MULTIPLIER - 1);
  return (damage * amount * critFactor) / cooldown;
}
