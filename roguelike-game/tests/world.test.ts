import { describe, expect, it } from 'vitest';
import { xpToNext } from '../src/game/progression';
import { type WorldEvents, World } from '../src/game/world';
import { MAX_WEAPONS } from '../src/weapons/defs';

const DT = 1 / 60;

function recorder(): WorldEvents & { log: string[] } {
  const log: string[] = [];
  return { log, sfx: (n) => log.push(`sfx:${n}`), shake: () => {}, announce: (t) => log.push(`announce:${t}`) };
}

function step(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT);
}

describe('World combat', () => {
  it('auto-fires the wand at the nearest enemy and damages it', () => {
    const w = new World(undefined, {}, 1);
    const p = w.player;
    const e = w.spawnEnemy('tank', p.x + 200, p.y)!;
    e.speed = 0;
    step(w, 1.5);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(w.damageDealt).toBeGreaterThan(0);
  });

  it('drops XP on death, vacuums it in and triggers a level-up', () => {
    const w = new World(undefined, {}, 2);
    const p = w.player;
    const e = w.spawnEnemy('grunt', p.x + 60, p.y)!;
    e.xp = xpToNext(1);
    expect(w.hitEnemy(e, 1e6, 0, 1, 0)).toBe(true);
    expect(w.kills).toBe(1);
    expect(e.active).toBe(false);
    const gems = w.pickups.items.slice(0, w.pickups.count).filter((g) => g.kind === 'xp');
    expect(gems).toHaveLength(1);
    step(w, 1);
    expect(w.pendingLevelUps).toBeGreaterThanOrEqual(1);
    expect(w.level).toBeGreaterThanOrEqual(2);
  });

  it('applies contact damage through armor, then grants i-frames', () => {
    const w = new World(undefined, {}, 3);
    w.weapons.length = 0; // knockback would push the attacker away
    w.stats.armor = 3;
    const p = w.player;
    const e = w.spawnEnemy('swarmer', p.x + 5, p.y)!;
    e.damage = 10;
    e.speed = 0;
    e.maxHp = e.hp = 1e9;
    w.update(DT);
    expect(p.hp).toBe(w.stats.maxHp - 7);
    step(w, 0.4); // still invulnerable
    expect(p.hp).toBe(w.stats.maxHp - 7);
    step(w, 0.4);
    expect(p.hp).toBe(w.stats.maxHp - 14);
  });

  it('ends the run when HP hits zero', () => {
    const w = new World(undefined, {}, 4);
    w.damagePlayer(1e6);
    expect(w.status).toBe('dead');
    expect(w.player.hp).toBe(0);
    const t = w.time;
    w.update(DT);
    expect(w.time).toBe(t); // frozen
  });

  it('ricochets a dagger between distinct enemies', () => {
    const w = new World(undefined, {}, 5);
    w.weapons.length = 0; // no auto-fire noise
    const p = w.player;
    const targets = [0, 1, 2].map((i) => {
      const e = w.spawnEnemy('grunt', p.x + 150 + i * 90, p.y + (i % 2) * 40)!;
      e.speed = 0;
      e.maxHp = e.hp = 1e6;
      return e;
    });
    w.fireProjectile('daggers', p.x, p.y, 0, 700, 7, 10, 0, 2, 0, 2);
    const pr = w.projectiles.items[0];
    step(w, 1.2);
    for (const t of targets) expect(t.hp).toBeLessThan(t.maxHp);
    expect(pr.hitCount).toBe(3);
  });

  it('piercing bolts hit each enemy at most once', () => {
    const w = new World(undefined, {}, 6);
    w.weapons.length = 0;
    const p = w.player;
    const e = w.spawnEnemy('tank', p.x + 100, p.y)!;
    e.speed = 0;
    e.maxHp = e.hp = 1e6;
    w.fireProjectile('wand', p.x, p.y, 0, 300, 6, 10, 5, 0, 0, 2);
    step(w, 1.5);
    const hits = (e.maxHp - e.hp) / 10;
    expect(hits === 1 || hits === 2).toBe(true); // 2 only if it crit (x2)
  });

  it('orbs respect the per-enemy hit cooldown', () => {
    const w = new World(undefined, {}, 7, 'orbs');
    w.stats.crit = 0;
    const p = w.player;
    const orb = w.weapons[0];
    const e = w.spawnEnemy('tank', p.x + orb.stats.area, p.y)!;
    e.speed = 0;
    e.def = { ...e.def, kbResist: 1 };
    e.maxHp = e.hp = 1e6;
    step(w, 3);
    const hits = (e.maxHp - e.hp) / Math.round(orb.stats.damage);
    expect(Number.isInteger(hits)).toBe(true);
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(3 / orb.stats.cooldown + 1);
  });

  it('lightning blasts every enemy inside its radius', () => {
    const w = new World(undefined, {}, 8);
    w.weapons.length = 0;
    const p = w.player;
    const inside = [w.spawnEnemy('tank', p.x + 100, p.y)!, w.spawnEnemy('tank', p.x + 130, p.y + 20)!];
    const outside = w.spawnEnemy('tank', p.x + 400, p.y)!;
    w.update(DT); // build the grid
    w.strikeLightning(p.x + 110, p.y, 20, 60);
    for (const e of inside) expect(e.hp).toBeLessThan(e.maxHp);
    expect(outside.hp).toBe(outside.maxHp);
  });

  it('spawns regular enemies outside the visible area', () => {
    const w = new World(undefined, {}, 9);
    w.weapons.length = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 20; i++) {
      w.update(DT);
      const p = w.player;
      for (let k = 0; k < w.enemies.count; k++) {
        const e = w.enemies.items[k];
        if (seen.has(e.uid)) continue;
        seen.add(e.uid);
        const off = Math.abs(e.x - p.x) > w.viewW / 2 || Math.abs(e.y - p.y) > w.viewH / 2;
        expect(off).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(30);
  });
});

describe('World upgrades', () => {
  it('adds weapons up to the slot limit and levels existing ones', () => {
    const w = new World(undefined, {}, 10);
    const add = (id: 'orbs' | 'lightning' | 'daggers' | 'aura') =>
      w.applyCard({ kind: 'weapon', id, level: 1, title: '', desc: '', icon: '', color: '#ffffff', rarity: 'rare' });
    add('orbs');
    add('lightning');
    add('daggers');
    add('aura');
    expect(w.weapons).toHaveLength(MAX_WEAPONS);
    expect(w.weapons.some((x) => x.id === 'aura')).toBe(false);
    w.applyCard({ kind: 'weapon', id: 'wand', level: 2, title: '', desc: '', icon: '', color: '#ffffff', rarity: 'common' });
    expect(w.weapons[0].level).toBe(2);
    expect(w.weapons[0].stats.amount).toBe(2);
  });

  it('passives recompute stats and weapon numbers', () => {
    const w = new World(undefined, {}, 11);
    const before = w.weapons[0].stats.damage;
    w.applyCard({ kind: 'passive', id: 'might', level: 1, title: '', desc: '', icon: '', color: '#ffffff', rarity: 'common' });
    expect(w.stats.might).toBeCloseTo(1.12);
    expect(w.weapons[0].stats.damage).toBeCloseTo(before * 1.12);
    const hp = w.player.hp;
    w.applyCard({ kind: 'passive', id: 'vitality', level: 1, title: '', desc: '', icon: '', color: '#ffffff', rarity: 'common' });
    expect(w.stats.maxHp).toBe(125);
    expect(w.player.hp).toBe(hp + 25);
  });

  it('announces a synergy when both weapons reach level 3', () => {
    const ev = recorder();
    const w = new World(ev, {}, 12);
    const card = (id: 'wand' | 'daggers', level: number) =>
      w.applyCard({ kind: 'weapon', id, level, title: '', desc: '', icon: '', color: '#ffffff', rarity: 'common' });
    card('daggers', 1);
    card('wand', 2);
    card('wand', 3);
    card('daggers', 2);
    expect(w.synergies.size).toBe(0);
    card('daggers', 3);
    expect(w.synergies.has('arcaneRicochet')).toBe(true);
    expect(ev.log).toContain('announce:SYNERGY: ARCANE RICOCHET');
  });

  it('wins shortly after the final boss dies', () => {
    const w = new World(undefined, {}, 13);
    const p = w.player;
    const boss = w.spawnEnemy('boss', p.x + 300, p.y)!;
    boss.finalBoss = true;
    w.spawnEnemy('grunt', p.x - 300, p.y);
    w.hitEnemy(boss, 1e9, 0, 0, 0);
    expect(w.enemies.items.slice(0, w.enemies.count).every((e) => !e.active)).toBe(true);
    step(w, 3);
    expect(w.status).toBe('won');
  });

  it('permanent upgrades change the starting stats', () => {
    const w = new World(undefined, { maxHp: 3, reroll: 2 }, 14);
    expect(w.stats.maxHp).toBe(136);
    expect(w.player.hp).toBe(136);
    expect(w.rerolls).toBe(3);
  });
});
