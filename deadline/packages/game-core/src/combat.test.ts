import { describe, expect, it } from 'vitest';
import { COMBAT, makeRng, requireWeaponDefinition, SECTOR_ZERO } from '@deadline/shared';
import {
  calculateDamage,
  currentSpreadDegrees,
  directionFromAngles,
  hitZoneFor,
  rangeFalloff,
  resolveHitscan,
  spreadDirection,
} from './combat.js';
import { CollisionWorld } from './collision.js';
import { findOpenLane } from './testing/openGround.js';

describe('damage calculation', () => {
  it('applies full damage to an unarmoured body shot', () => {
    const result = calculateDamage({
      baseDamage: 32,
      distance: 10,
      range: 62,
      hitZone: 'body',
      health: 100,
      armor: 0,
    });
    expect(result.healthDamage).toBe(32);
    expect(result.armorDamage).toBe(0);
    expect(result.healthAfter).toBe(68);
    expect(result.killed).toBe(false);
  });

  it('multiplies headshots and reduces limb shots', () => {
    const head = calculateDamage({
      baseDamage: 32, distance: 5, range: 62, hitZone: 'head', health: 100, armor: 0,
    });
    const limb = calculateDamage({
      baseDamage: 32, distance: 5, range: 62, hitZone: 'limb', health: 100, armor: 0,
    });
    expect(head.healthDamage).toBeCloseTo(32 * COMBAT.headshotMultiplier, 2);
    expect(limb.healthDamage).toBeCloseTo(32 * COMBAT.limbMultiplier, 2);
  });

  it('armour absorbs damage and degrades', () => {
    const result = calculateDamage({
      baseDamage: 100, distance: 5, range: 62, hitZone: 'body', health: 100, armor: 100,
    });
    expect(result.healthDamage).toBeLessThan(100);
    expect(result.armorDamage).toBeGreaterThan(0);
    expect(result.armorAfter).toBeLessThan(100);
    expect(result.healthDamage + result.armorDamage / COMBAT.armorDurabilityLossRatio).toBeCloseTo(100, 1);
  });

  it('never returns negative health or armour', () => {
    const result = calculateDamage({
      baseDamage: 500, distance: 1, range: 62, hitZone: 'head', health: 12, armor: 4,
    });
    expect(result.healthAfter).toBe(0);
    expect(result.armorAfter).toBe(0);
    expect(result.killed).toBe(true);
  });

  it('armour with few points left cannot absorb more than it has', () => {
    const result = calculateDamage({
      baseDamage: 80, distance: 5, range: 62, hitZone: 'body', health: 100, armor: 5,
    });
    expect(result.armorDamage).toBeLessThanOrEqual(5);
    expect(result.armorAfter).toBeGreaterThanOrEqual(0);
  });

  it('kills exactly at zero health', () => {
    const result = calculateDamage({
      baseDamage: 25, distance: 1, range: 32, hitZone: 'body', health: 25, armor: 0,
    });
    expect(result.healthAfter).toBe(0);
    expect(result.killed).toBe(true);
  });
});

describe('range falloff', () => {
  it('is 1 inside the effective range', () => {
    expect(rangeFalloff(10, 62)).toBe(1);
    expect(rangeFalloff(62, 62)).toBe(1);
  });

  it('decays toward the floor beyond the effective range', () => {
    expect(rangeFalloff(93, 62)).toBeLessThan(1);
    expect(rangeFalloff(124, 62)).toBeCloseTo(COMBAT.falloffMinMultiplier, 4);
    expect(rangeFalloff(400, 62)).toBeCloseTo(COMBAT.falloffMinMultiplier, 4);
  });
});

describe('hit zones', () => {
  it('maps cylinder heights to zones', () => {
    expect(hitZoneFor(1.7, 1.8)).toBe('head');
    expect(hitZoneFor(1.2, 1.8)).toBe('body');
    expect(hitZoneFor(0.3, 1.8)).toBe('limb');
  });
});

describe('spread', () => {
  it('grows while moving and shrinks while aiming', () => {
    const ar = requireWeaponDefinition('ar12');
    const hipStill = currentSpreadDegrees(ar, { ads: false, speed: 0, consecutiveShots: 0 });
    const hipMoving = currentSpreadDegrees(ar, { ads: false, speed: 7, consecutiveShots: 0 });
    const adsStill = currentSpreadDegrees(ar, { ads: true, speed: 0, consecutiveShots: 0 });
    expect(hipMoving).toBeGreaterThan(hipStill);
    expect(adsStill).toBeLessThan(hipStill);
  });

  it('is capped by the weapon maximum', () => {
    const smg = requireWeaponDefinition('vx7');
    const spread = currentSpreadDegrees(smg, { ads: false, speed: 7, consecutiveShots: 200 });
    expect(spread).toBeLessThanOrEqual(smg.spread.max);
  });

  it('produces unit-length directions', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 20; i += 1) {
      const dir = spreadDirection(1.2, 0.1, 3, rng);
      expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 5);
    }
  });
});

describe('hitscan resolution', () => {
  const world = new CollisionWorld(SECTOR_ZERO);
  // Sector Zero is generated, so the test finds a clear firing lane rather
  // than assuming one exists at a fixed coordinate.
  const lane = findOpenLane(26, SECTOR_ZERO, world);
  const along = (metres: number) => {
    const direction = directionFromAngles(lane.yaw, 0);
    return {
      x: lane.position.x + direction.x * metres,
      y: 0,
      z: lane.position.z + direction.z * metres,
    };
  };

  it('hits a target standing in the open', () => {
    const origin = { x: lane.position.x, y: 1.55, z: lane.position.z };
    const target = {
      id: 't1', kind: 'ai' as const, position: along(10), radius: 0.42, height: 1.8,
    };
    const result = resolveHitscan(origin, directionFromAngles(lane.yaw, 0), [target], world, 50);
    expect(result.hit?.target.id).toBe('t1');
    expect(result.hit?.distance).toBeGreaterThan(9);
    expect(result.hit?.distance).toBeLessThan(11);
  });

  it('is blocked by a wall between shooter and target', () => {
    // Fire straight into the southern boundary wall from just in front of it.
    const origin = { x: 0, y: 1.55, z: -190 };
    const target = {
      id: 't2', kind: 'ai' as const, position: { x: 0, y: 0, z: -230 }, radius: 0.42, height: 1.8,
    };
    const result = resolveHitscan(origin, directionFromAngles(0, 0), [target], world, 80);
    expect(result.hit).toBeNull();
    expect(result.blockedByGeometry).toBe(true);
  });

  it('picks the nearest of several targets', () => {
    const origin = { x: lane.position.x, y: 1.55, z: lane.position.z };
    const near = {
      id: 'near', kind: 'player' as const, position: along(8), radius: 0.42, height: 1.8,
    };
    const far = {
      id: 'far', kind: 'player' as const, position: along(20), radius: 0.42, height: 1.8,
    };
    const result = resolveHitscan(origin, directionFromAngles(lane.yaw, 0), [far, near], world, 60);
    expect(result.hit?.target.id).toBe('near');
  });
});
