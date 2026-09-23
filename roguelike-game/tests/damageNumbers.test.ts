import { describe, expect, it } from 'vitest';
import { DAMAGE_NUMBER_CAP, World } from '../src/game/world';

function world(): World {
  const w = new World(undefined, {}, 21);
  w.weapons.length = 0;
  w.stats.crit = 0;
  return w;
}

const numbers = (w: World) => w.floaters.items.slice(0, w.floaters.count).filter((f) => f.active);

describe('damage numbers', () => {
  it('merges rapid hits on one enemy into a single growing number', () => {
    const w = world();
    const e = w.spawnEnemy('tank', w.player.x + 200, w.player.y)!;
    e.maxHp = e.hp = 1e6;
    for (let i = 0; i < 10; i++) w.hitEnemy(e, 7, 0, 0, 0);
    const shown = numbers(w);
    expect(shown).toHaveLength(1);
    expect(shown[0].value).toBe(70);
    expect(shown[0].text).toBe('70');
  });

  it('starts a new number once the old one has faded', () => {
    const w = world();
    const e = w.spawnEnemy('tank', w.player.x + 200, w.player.y)!;
    e.maxHp = e.hp = 1e6;
    e.speed = 0;
    w.hitEnemy(e, 5, 0, 0, 0);
    for (let i = 0; i < 60; i++) w.update(1 / 60);
    w.hitEnemy(e, 5, 0, 0, 0);
    const shown = numbers(w);
    expect(shown).toHaveLength(1);
    expect(shown[0].value).toBe(5);
  });

  it('folds an area hit on a packed group into a few numbers', () => {
    const w = world();
    const p = w.player;
    const group = Array.from({ length: 20 }, (_, i) => {
      const e = w.spawnEnemy('swarmer', p.x + 200 + (i % 5) * 6, p.y + Math.floor(i / 5) * 6)!;
      e.maxHp = e.hp = 1e6;
      return e;
    });
    for (const e of group) w.hitEnemy(e, 22, 0, 0, 0);
    const shown = numbers(w);
    expect(shown.length).toBeLessThanOrEqual(3);
    expect(shown.reduce((sum, f) => sum + f.value, 0)).toBe(22 * 20);
  });

  it('caps how many numbers can be on screen', () => {
    const w = world();
    const p = w.player;
    for (let i = 0; i < 200; i++) {
      const e = w.spawnEnemy('grunt', p.x - 1400 + (i % 20) * 140, p.y - 1400 + Math.floor(i / 20) * 140)!;
      e.maxHp = e.hp = 1e6;
      w.hitEnemy(e, 3, 0, 0, 0);
    }
    expect(numbers(w).length).toBeLessThanOrEqual(DAMAGE_NUMBER_CAP);
  });

  it('never merges into a recycled floater', () => {
    const w = world();
    const e = w.spawnEnemy('tank', w.player.x + 200, w.player.y)!;
    e.maxHp = e.hp = 1e6;
    w.hitEnemy(e, 5, 0, 0, 0);
    const f = e.floater!;
    // Simulate the floater dying and being reused for something else.
    f.active = false;
    w.floaters.compact();
    w.floater(0, 0, 'gold', '#fff', 10);
    w.hitEnemy(e, 5, 0, 0, 0);
    const mine = numbers(w).filter((x) => x.text !== 'gold');
    expect(mine).toHaveLength(1);
    expect(mine[0].value).toBe(5);
  });
});
