import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { rollCards } from '../src/game/upgrades';
import { ARENA_H, ARENA_W, World } from '../src/game/world';

/**
 * A crude bot: runs away from the local enemy centre of mass while drifting
 * back towards the arena middle, and always takes the first card offered.
 */
function playBot(world: World, seconds: number, rng: Rng): void {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let s = 0; s < steps && world.status === 'running'; s++) {
    const p = world.player;
    let fx = 0;
    let fy = 0;
    world.forEachEnemyInCircle(p.x, p.y, 260, (e) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d2 = dx * dx + dy * dy + 1;
      fx += dx / d2;
      fy += dy / d2;
    });
    fx += (ARENA_W / 2 - p.x) * 0.00002;
    fy += (ARENA_H / 2 - p.y) * 0.00002;
    const l = Math.hypot(fx, fy);
    world.moveInput.x = l > 1e-9 ? fx / l : 0;
    world.moveInput.y = l > 1e-9 ? fy / l : 0;
    world.update(dt);
    while (world.pendingLevelUps > 0) world.applyCard(rollCards(world.loadout(), rng)[0]);
  }
}

describe('headless simulation', () => {
  it('runs several minutes of gameplay without errors and keeps pools consistent', () => {
    const world = new World(undefined, {}, 1234);
    playBot(world, 240, new Rng(99));
    // Everyone below count must be live after compaction.
    for (const pool of [world.enemies, world.projectiles, world.pickups, world.particles]) {
      for (let i = 0; i < pool.count; i++) expect(pool.items[i].active).toBe(true);
      expect(pool.count).toBeLessThanOrEqual(pool.capacity);
    }
    expect(world.kills).toBeGreaterThan(50);
    expect(world.level).toBeGreaterThan(3);
    expect(world.player.x).toBeGreaterThanOrEqual(0);
    expect(world.player.x).toBeLessThanOrEqual(ARENA_W);
    // eslint-disable-next-line no-console
    console.log(
      `sim: status=${world.status} t=${world.time.toFixed(0)}s lvl=${world.level} kills=${world.kills} ` +
        `enemies=${world.enemies.count} gems=${world.pickups.count} weapons=${world.weapons.map((w) => `${w.id}${w.level}`).join(',')} ` +
        `hp=${world.player.hp.toFixed(0)}`,
    );
  });

  it('is deterministic for a given seed', () => {
    const a = new World(undefined, {}, 7);
    const b = new World(undefined, {}, 7);
    playBot(a, 30, new Rng(1));
    playBot(b, 30, new Rng(1));
    expect(a.kills).toBe(b.kills);
    expect(a.player.x).toBeCloseTo(b.player.x, 6);
    expect(a.enemies.count).toBe(b.enemies.count);
  });
});
