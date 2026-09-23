import { TAU } from '../engine/math';
import type { World } from '../game/world';
import { type WeaponId } from './defs';
import { type WeaponInstance } from './weapon';

/**
 * Per-weapon firing logic. Each behavior runs once per fixed step and talks
 * to the world only through its public helpers.
 */
export type WeaponBehavior = (world: World, w: WeaponInstance, dt: number) => void;

const TARGET_RANGE = 620;
const targets = new Int32Array(16);

/** Wand: bursts of bolts at the nearest enemies. */
const wand: WeaponBehavior = (world, w, dt) => {
  const p = world.player;
  if (w.burstLeft > 0) {
    w.burstTimer -= dt;
    if (w.burstTimer <= 0) {
      w.burstTimer = 0.07;
      const shotIdx = w.stats.amount - w.burstLeft;
      w.burstLeft--;
      const n = world.nearestEnemies(p.x, p.y, TARGET_RANGE, w.stats.amount, targets);
      if (n === 0) return;
      const e = world.enemies.items[targets[shotIdx % n]];
      const ang = Math.atan2(e.y - p.y, e.x - p.x) + (shotIdx >= n ? (world.rng.next() - 0.5) * 0.35 : 0);
      const bounces = world.synergies.has('arcaneRicochet') ? 1 : 0;
      world.fireProjectile('wand', p.x, p.y, ang, w.stats.speed, w.stats.area, w.stats.damage, w.stats.pierce, bounces, w.stats.knockback, 1.4);
      world.fx.sfx('shoot');
    }
    return;
  }
  w.timer -= dt;
  if (w.timer > 0) return;
  if (world.nearestEnemies(p.x, p.y, TARGET_RANGE, 1, targets) === 0) {
    w.timer = 0; // stay ready until something is in range
    return;
  }
  w.timer = w.stats.cooldown;
  w.burstLeft = w.stats.amount;
  w.burstTimer = 0;
};

/** Daggers: thrown at nearest enemies, ricochet between targets. */
const daggers: WeaponBehavior = (world, w, dt) => {
  const p = world.player;
  w.timer -= dt;
  if (w.timer > 0) return;
  const n = world.nearestEnemies(p.x, p.y, TARGET_RANGE, w.stats.amount, targets);
  if (n === 0) {
    w.timer = 0;
    return;
  }
  w.timer = w.stats.cooldown;
  for (let i = 0; i < w.stats.amount; i++) {
    const e = world.enemies.items[targets[i % n]];
    const ang = Math.atan2(e.y - p.y, e.x - p.x) + (i >= n ? (i - n + 1) * 0.25 : 0);
    world.fireProjectile('daggers', p.x, p.y, ang, w.stats.speed, w.stats.area, w.stats.damage, 0, w.stats.bounces, w.stats.knockback, 1.1);
  }
  world.fx.sfx('dagger');
};

/** Orbs: circle the player and hit anything they touch (per-enemy cooldown). */
const orbs: WeaponBehavior = (world, w, dt) => {
  const p = world.player;
  const nova = world.synergies.has('novaCore');
  const count = Math.min(16, w.stats.amount);
  w.angle = (w.angle + w.stats.speed * dt) % TAU;
  w.orbR = 12 * world.stats.area * (nova ? 1.3 : 1);
  const dmg = w.stats.damage * (nova ? 1.25 : 1);
  const storm = world.synergies.has('stormOrbs');
  for (let i = 0; i < count; i++) {
    const a = w.angle + (i * TAU) / count;
    const ox = p.x + Math.cos(a) * w.stats.area;
    const oy = p.y + Math.sin(a) * w.stats.area;
    w.orbX[i] = ox;
    w.orbY[i] = oy;
    world.forEachEnemyInCircle(ox, oy, w.orbR, (e) => {
      if (e.orbHitUntil > world.time) return;
      e.orbHitUntil = world.time + w.stats.cooldown;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      world.hitEnemy(e, dmg, w.stats.knockback, dx / d, dy / d);
      if (storm && world.stormCd <= 0 && world.rng.chance(0.15)) {
        world.stormCd = 0.35;
        world.strikeLightning(e.x, e.y, dmg * 1.5, 60);
      }
    });
  }
};

/** Lightning: strikes random on-screen enemies with an area blast. */
const lightning: WeaponBehavior = (world, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  let fired = 0;
  for (let i = 0; i < w.stats.amount; i++) {
    const e = world.randomVisibleEnemy();
    if (!e) break;
    world.strikeLightning(e.x, e.y, w.stats.damage, w.stats.area);
    fired++;
  }
  w.timer = fired > 0 ? w.stats.cooldown : 0.2;
};

/** Aura: periodic damaging, slowing pulse around the player. */
const aura: WeaponBehavior = (world, w, dt) => {
  const p = world.player;
  w.pulse = Math.max(0, w.pulse - dt * 3);
  w.timer -= dt;
  if (w.timer > 0) return;
  w.timer = w.stats.cooldown;
  w.pulse = 1;
  let hits = 0;
  world.forEachEnemyInCircle(p.x, p.y, w.stats.area, (e) => {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    e.slowUntil = world.time + 0.7;
    world.hitEnemy(e, w.stats.damage, w.stats.knockback, dx / d, dy / d, false);
    hits++;
  });
  if (hits > 0) world.fx.sfx('pulse');
};

export const BEHAVIORS: Readonly<Record<WeaponId, WeaponBehavior>> = { wand, daggers, orbs, lightning, aura };
