import { COMBAT, MOVEMENT, type Rng, type Vec3, type WeaponDefinition } from '@deadline/shared';
import type { CollisionWorld } from './collision.js';
import { rayCylinder } from './collision.js';

export type HitZone = 'head' | 'body' | 'limb';

export interface DamageInput {
  /** Weapon damage before any modifier. */
  readonly baseDamage: number;
  /** Metres between shooter and target. */
  readonly distance: number;
  /** Weapon effective range. */
  readonly range: number;
  readonly hitZone: HitZone;
  readonly health: number;
  readonly armor: number;
}

export interface DamageResult {
  /** Damage actually removed from health. */
  readonly healthDamage: number;
  /** Armour points consumed. */
  readonly armorDamage: number;
  readonly healthAfter: number;
  readonly armorAfter: number;
  readonly killed: boolean;
  /** Raw damage before armour, after range/zone modifiers. */
  readonly rawDamage: number;
}

/** Damage multiplier from range falloff. 1 inside the effective range. */
export function rangeFalloff(distance: number, range: number): number {
  const start = range * COMBAT.falloffStartRatio;
  if (distance <= start) return 1;
  const end = range * 2;
  if (distance >= end) return COMBAT.falloffMinMultiplier;
  const t = (distance - start) / Math.max(1e-6, end - start);
  return 1 + (COMBAT.falloffMinMultiplier - 1) * t;
}

export function zoneMultiplier(zone: HitZone): number {
  switch (zone) {
    case 'head':
      return COMBAT.headshotMultiplier;
    case 'limb':
      return COMBAT.limbMultiplier;
    default:
      return 1;
  }
}

/**
 * The single authoritative damage formula. Runs on the server only; the client
 * never sends a damage number.
 *
 * Armour absorbs a fraction of incoming damage while it has points left, and
 * degrades by a fraction of what it absorbed.
 */
export function calculateDamage(input: DamageInput): DamageResult {
  const rawDamage =
    input.baseDamage * rangeFalloff(input.distance, input.range) * zoneMultiplier(input.hitZone);

  let armorDamage = 0;
  let healthDamage = rawDamage;

  if (input.armor > 0) {
    const absorbed = Math.min(input.armor / COMBAT.armorDurabilityLossRatio, rawDamage * COMBAT.armorDamageReduction);
    healthDamage = rawDamage - absorbed;
    armorDamage = Math.min(input.armor, absorbed * COMBAT.armorDurabilityLossRatio);
  }

  healthDamage = Math.max(0, roundTo(healthDamage, 2));
  armorDamage = Math.max(0, roundTo(armorDamage, 2));

  const healthAfter = Math.max(0, roundTo(input.health - healthDamage, 2));
  const armorAfter = Math.max(0, roundTo(input.armor - armorDamage, 2));

  return {
    healthDamage,
    armorDamage,
    healthAfter,
    armorAfter,
    killed: healthAfter <= 0,
    rawDamage: roundTo(rawDamage, 2),
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Effective spread cone half-angle, in degrees, for the current shot. */
export function currentSpreadDegrees(
  weapon: WeaponDefinition,
  options: { ads: boolean; speed: number; consecutiveShots: number },
): number {
  const movementRatio = Math.min(1, options.speed / MOVEMENT.sprintSpeed);
  let spread = weapon.spread.base + weapon.spread.moving * movementRatio;
  spread += weapon.spread.perShot * options.consecutiveShots;
  if (options.ads) spread *= weapon.spread.adsMultiplier;
  return Math.min(weapon.spread.max, spread);
}

/** Recoil kick applied to the camera for one shot. */
export function recoilKick(
  weapon: WeaponDefinition,
  options: { ads: boolean; consecutiveShots: number },
  rng: Rng,
): { pitch: number; yaw: number } {
  const ramp = Math.min(
    weapon.recoil.maxMultiplier,
    1 + weapon.recoil.rampPerShot * options.consecutiveShots,
  );
  const adsFactor = options.ads ? weapon.recoil.adsMultiplier : 1;
  const pitch = weapon.recoil.vertical * ramp * adsFactor;
  const yaw = weapon.recoil.horizontal * ramp * adsFactor * rng.float(-1, 1);
  return { pitch, yaw };
}

/** Build a unit direction from yaw/pitch plus a random offset inside the cone. */
export function spreadDirection(
  yaw: number,
  pitch: number,
  spreadDegrees: number,
  rng: Rng,
): Vec3 {
  const spreadRad = (spreadDegrees * Math.PI) / 180;
  const angle = rng.float(0, Math.PI * 2);
  // sqrt keeps the distribution uniform across the cone's area.
  const radius = Math.sqrt(rng.next()) * spreadRad;
  const offsetYaw = Math.cos(angle) * radius;
  const offsetPitch = Math.sin(angle) * radius;
  return directionFromAngles(yaw + offsetYaw, pitch + offsetPitch);
}

/**
 * Convert yaw/pitch into a world direction.
 * Yaw 0 looks down -Z, matching the Three.js convention used by the renderer.
 */
export function directionFromAngles(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  };
}

export interface HitTarget {
  readonly id: string;
  readonly kind: 'player' | 'ai';
  /** Feet position. */
  readonly position: Vec3;
  readonly radius: number;
  readonly height: number;
}

export interface HitscanHit {
  readonly target: HitTarget;
  readonly distance: number;
  readonly point: Vec3;
  readonly zone: HitZone;
}

export interface HitscanResult {
  /** Nearest target hit, if any. */
  readonly hit: HitscanHit | null;
  /** Where the trace stopped — a target, geometry or max range. */
  readonly endPoint: Vec3;
  readonly blockedByGeometry: boolean;
}

/**
 * Resolve one hitscan trace against geometry and entity cylinders.
 * Geometry always wins when it is closer than the nearest entity.
 */
export function resolveHitscan(
  origin: Vec3,
  direction: Vec3,
  targets: readonly HitTarget[],
  world: CollisionWorld,
  maxDistance = COMBAT.maxRaycastDistance,
): HitscanResult {
  const geometry = world.raycast(origin, direction, maxDistance);
  const geometryDistance = geometry?.distance ?? maxDistance;

  let best: HitscanHit | null = null;
  for (const target of targets) {
    const distance = rayCylinder(
      origin,
      direction,
      target.position,
      target.radius,
      target.height,
      maxDistance,
    );
    if (distance === null || distance > geometryDistance) continue;
    if (best !== null && distance >= best.distance) continue;
    const point = {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance,
    };
    best = { target, distance, point, zone: hitZoneFor(point.y - target.position.y, target.height) };
  }

  if (best) {
    return { hit: best, endPoint: best.point, blockedByGeometry: false };
  }

  const stop = geometry ? geometry.distance : maxDistance;
  return {
    hit: null,
    endPoint: {
      x: origin.x + direction.x * stop,
      y: origin.y + direction.y * stop,
      z: origin.z + direction.z * stop,
    },
    blockedByGeometry: geometry !== null,
  };
}

/** Map a hit height on the cylinder to a damage zone. */
export function hitZoneFor(localY: number, height: number): HitZone {
  const ratio = height <= 0 ? 0 : localY / height;
  if (ratio >= 0.86) return 'head';
  if (ratio <= 0.42) return 'limb';
  return 'body';
}
