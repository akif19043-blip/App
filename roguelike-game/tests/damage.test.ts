import { describe, expect, it } from 'vitest';
import { BASE_STATS, CRIT_MULTIPLIER, MIN_COOLDOWN_MULT, cloneStats } from '../src/game/stats';
import {
  type DamageRoll, effectiveCooldown, expectedDps, knockback, mitigate, rollDamage, scaledDamage,
} from '../src/weapons/damage';
import {
  MAX_WEAPON_LEVEL, WEAPONS, WEAPON_IDS, activeSynergies, resolveWeapon, weaponBaseAtLevel,
} from '../src/weapons/defs';

const out: DamageRoll = { amount: 0, crit: false };

describe('damage calculations', () => {
  it('scales base damage by might', () => {
    expect(scaledDamage(10, 1)).toBe(10);
    expect(scaledDamage(10, 1.5)).toBe(15);
    expect(scaledDamage(10, -1)).toBe(0);
  });

  it('crits only when the roll is under the crit chance', () => {
    expect(rollDamage(10, 0.25, 0.1, out)).toEqual({ amount: 10 * CRIT_MULTIPLIER, crit: true });
    expect(rollDamage(10, 0.25, 0.25, out)).toEqual({ amount: 10, crit: false });
    expect(rollDamage(10, 0, 0, out).crit).toBe(false);
    expect(rollDamage(10, 1, 0.9999, out).crit).toBe(true);
  });

  it('rounds damage and deals at least 1', () => {
    expect(rollDamage(12.4, 0, 0.5, out).amount).toBe(12);
    expect(rollDamage(12.6, 0, 0.5, out).amount).toBe(13);
    expect(rollDamage(0.1, 0, 0.5, out).amount).toBe(1);
  });

  it('applies flat armor with a minimum of 1 damage', () => {
    expect(mitigate(10, 0)).toBe(10);
    expect(mitigate(10, 3)).toBe(7);
    expect(mitigate(10, 50)).toBe(1);
    expect(mitigate(10, -5)).toBe(10); // negative armor never amplifies
  });

  it('reduces knockback by resistance', () => {
    expect(knockback(100, 0)).toBe(100);
    expect(knockback(100, 0.85)).toBeCloseTo(15);
    expect(knockback(100, 1)).toBe(0);
    expect(knockback(100, 2)).toBe(0);
  });

  it('clamps cooldown reduction', () => {
    expect(effectiveCooldown(1, 0.8, 0.35)).toBeCloseTo(0.8);
    expect(effectiveCooldown(1, 0.1, 0.35)).toBeCloseTo(0.35);
  });

  it('computes expected DPS including crits', () => {
    expect(expectedDps(10, 1, 1, 0)).toBe(10);
    expect(expectedDps(10, 0.5, 2, 0)).toBe(40);
    expect(expectedDps(10, 1, 1, 1)).toBe(10 * CRIT_MULTIPLIER);
  });
});

describe('weapon scaling', () => {
  it('has a level step for every level after 1', () => {
    for (const id of WEAPON_IDS) expect(WEAPONS[id].steps).toHaveLength(MAX_WEAPON_LEVEL - 1);
  });

  it('level 1 equals the base definition', () => {
    for (const id of WEAPON_IDS) expect(weaponBaseAtLevel(id, 1)).toEqual(WEAPONS[id].base);
  });

  it('applies wand level steps cumulatively', () => {
    const w = weaponBaseAtLevel('wand', MAX_WEAPON_LEVEL);
    expect(w.damage).toBe(10 + 5 + 6);
    expect(w.amount).toBe(1 + 1 + 1 + 1);
    expect(w.pierce).toBe(2);
    expect(w.cooldown).toBeCloseTo(0.75 * 0.85);
  });

  it('clamps out-of-range levels', () => {
    expect(weaponBaseAtLevel('orbs', 0)).toEqual(weaponBaseAtLevel('orbs', 1));
    expect(weaponBaseAtLevel('orbs', 99)).toEqual(weaponBaseAtLevel('orbs', MAX_WEAPON_LEVEL));
  });

  it('gets strictly stronger every level', () => {
    for (const id of WEAPON_IDS) {
      let prev = 0;
      for (let lv = 1; lv <= MAX_WEAPON_LEVEL; lv++) {
        const b = weaponBaseAtLevel(id, lv);
        // Orb damage also scales with spin speed (more contacts per second).
        const spin = id === 'orbs' ? b.speed : 1;
        const power = (b.damage * b.amount * b.area * spin * (1 + b.pierce) * (1 + b.bounces)) / b.cooldown;
        expect(power).toBeGreaterThan(prev);
        prev = power;
      }
    }
  });

  it('applies player stats when resolving a weapon', () => {
    const s = cloneStats(BASE_STATS);
    s.might = 2;
    s.cooldown = 0.5;
    s.area = 1.5;
    s.amount = 1;
    s.projSpeed = 1.25;
    const r = resolveWeapon('wand', 1, s);
    expect(r.damage).toBe(20);
    expect(r.cooldown).toBeCloseTo(0.75 * 0.5);
    expect(r.area).toBeCloseTo(9);
    expect(r.amount).toBe(2);
    expect(r.speed).toBeCloseTo(620 * 1.25);
    // Cooldown multiplier floor.
    s.cooldown = 0.01;
    expect(resolveWeapon('wand', 1, s).cooldown).toBeCloseTo(0.75 * MIN_COOLDOWN_MULT);
    // The aura ignores Multishot; orbs ignore projectile speed.
    expect(resolveWeapon('aura', 1, s).amount).toBe(1);
    expect(resolveWeapon('orbs', 1, s).speed).toBe(WEAPONS.orbs.base.speed);
  });

  it('unlocks synergies only when both weapons reach the threshold', () => {
    expect(activeSynergies([{ id: 'wand', level: 3 }, { id: 'daggers', level: 2 }])).toEqual([]);
    expect(activeSynergies([{ id: 'wand', level: 3 }, { id: 'daggers', level: 3 }])).toEqual(['arcaneRicochet']);
    expect(
      activeSynergies([
        { id: 'orbs', level: 8 }, { id: 'lightning', level: 5 }, { id: 'aura', level: 3 }, { id: 'daggers', level: 4 },
      ]).sort(),
    ).toEqual(['novaCore', 'stormOrbs', 'thunderBlades']);
  });
});
