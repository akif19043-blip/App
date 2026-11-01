/**
 * One night: the whole simulation of a run, and nothing else.
 *
 * No DOM, no canvas, no clock: `step(dt, move)` advances it, the renderer
 * reads its arrays, and `events` tells the sound and the particles what just
 * happened. That keeps it testable -- the suites step a seeded night at a
 * fixed timestep and check what came out.
 */

import {
  ADS, DAWN, ENEMIES, ENEMY_SCALING, MAX_LEVEL, META, PASSIVES, PLAYER,
  SLOTS, SPAWN, WAVES, WEAPONS, xpToNext,
} from './config.js';
import { makeRng } from './rng.js';

const TAU = Math.PI * 2;
const CELL = 48;
const MAX_GEMS = 500;

export const WEAPON_IDS = Object.keys(WEAPONS);
export const PASSIVE_IDS = Object.keys(PASSIVES);

/** A spatial hash of the bugs, rebuilt every step: who is near whom. */
class Grid {
  constructor() {
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  insert(enemy) {
    const key = cellKey(Math.floor(enemy.x / CELL), Math.floor(enemy.y / CELL));
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(enemy);
  }

  /** Every bug whose cell overlaps the circle; callers do the exact test. */
  query(x, y, radius, out) {
    out.length = 0;
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const y0 = Math.floor((y - radius) / CELL);
    const y1 = Math.floor((y + radius) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        const cell = this.cells.get(cellKey(cx, cy));
        if (cell) for (let i = 0; i < cell.length; i += 1) out.push(cell[i]);
      }
    }
    return out;
  }
}

function cellKey(cx, cy) {
  return (cx + 32768) * 65536 + (cy + 32768);
}

export class Run {
  /**
   * @param {object} options
   * @param {number} [options.seed]
   * @param {object} [options.meta]  shop levels: { vitality: 2, ... }
   */
  constructor({ seed = 1, meta = {} } = {}) {
    this.rng = makeRng(seed);
    this.meta = meta;
    this.time = 0;
    this.view = { w: 640, h: 1138 };      // world units on screen; main sets it
    this.player = {
      x: 0, y: 0, r: PLAYER.radius, hp: 0, maxHp: 0,
      inv: 0, facing: 0, moving: false, hurt: 0,
    };
    this.enemies = [];
    this.shots = [];          // the player's projectiles
    this.spits = [];          // the bugs'
    this.embers = [];
    this.gems = [];           // xp dew, gold amber and glowberries
    this.pulses = [];         // expanding rings, for the renderer
    this.arcs = [];           // lightning paths, for the renderer
    this.events = [];
    this.grid = new Grid();
    this.near = [];

    this.weapons = new Map();
    this.passives = new Map();
    this.weapons.set('spark', { level: 1, timer: 0.4 });
    this.haloAngle = 0;

    this.level = 1;
    this.xp = 0;
    this.xpNext = xpToNext(1);
    this.pendingLevels = 0;
    this.kills = 0;
    this.amber = 0;           // gold picked up this run
    this.spawnCredit = 0;
    this.nextRing = SPAWN.ringFirst;
    this.elitesLeft = SPAWN.elites.slice();
    this.bossSpawned = false;
    this.over = false;
    this.won = false;
    this.revived = false;
    this.distance = 0;

    this.refreshStats();
    this.player.hp = this.player.maxHp;
  }

  // ------------------------------------------------------------- stats --

  passive(id) {
    return this.passives.get(id) || 0;
  }

  metaBonus(id) {
    return (this.meta[id] || 0) * META[id].per;
  }

  /** Everything the upgrades change, recomputed whenever one is taken. */
  refreshStats() {
    const p = this.player;
    const oldMax = p.maxHp;
    this.stats = {
      damage: (1 + this.metaBonus('power')) * (1 + PASSIVES.bright.damage * this.passive('bright')),
      cooldown: Math.max(0.45, 1 - PASSIVES.focus.cooldown * this.passive('focus')),
      area: 1 + PASSIVES.reach.area * this.passive('reach'),
      speed: PLAYER.speed * (1 + this.metaBonus('swiftness'))
        * (1 + PASSIVES.wings.speed * this.passive('wings')),
      magnet: PLAYER.magnet * (1 + this.metaBonus('magnetism'))
        * (1 + PASSIVES.glow.magnet * this.passive('glow')),
      regen: this.metaBonus('vigor') + PASSIVES.nectar.regen * this.passive('nectar'),
      gold: 1 + this.metaBonus('greed'),
    };
    p.maxHp = PLAYER.hp + this.metaBonus('vitality') + PASSIVES.shell.hp * this.passive('shell');
    // More max HP arrives filled, not as an empty bar to grow into.
    if (oldMax) p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - oldMax));
  }

  // -------------------------------------------------------------- step --

  /**
   * @param {number} dt seconds
   * @param {{x:number, y:number}} move  stick direction, length 0..1
   */
  step(dt, move) {
    if (this.over || this.pendingLevels > 0) return;
    this.time += dt;
    this.movePlayer(dt, move);
    this.spawn(dt);
    this.moveEnemies(dt);
    this.rebuildGrid();
    this.separate();
    this.fireWeapons(dt);
    this.moveShots(dt);
    this.moveSpits(dt);
    this.burnEmbers(dt);
    this.touchPlayer();
    this.collectGems(dt);
    this.fade(dt);
    this.reap();

    if (this.time >= DAWN && !this.over) {
      this.won = true;
      this.over = true;
      this.events.push({ t: 'dawn' });
    }
  }

  movePlayer(dt, move) {
    const p = this.player;
    let mx = move ? move.x : 0;
    let my = move ? move.y : 0;
    // A NaN here would put the firefly nowhere, where nothing can ever touch
    // it again. Bad input is no input.
    if (!Number.isFinite(mx) || !Number.isFinite(my)) {
      mx = 0;
      my = 0;
    }
    const length = Math.hypot(mx, my);
    if (length > 1) {
      mx /= length;
      my /= length;
    }
    p.moving = length > 0.05;
    if (p.moving) p.facing = Math.atan2(my, mx);
    const step = this.stats.speed * dt;
    p.x += mx * step;
    p.y += my * step;
    this.distance += Math.hypot(mx, my) * step;
    p.inv = Math.max(0, p.inv - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    if (this.stats.regen > 0) p.hp = Math.min(p.maxHp, p.hp + this.stats.regen * dt);
  }

  // ------------------------------------------------------------ spawns --

  get halfDiagonal() {
    return Math.hypot(this.view.w, this.view.h) / 2;
  }

  waveMix() {
    let mix = WAVES[0].mix;
    for (const wave of WAVES) if (this.time >= wave.at) mix = wave.mix;
    return mix;
  }

  spawnRate() {
    const minutes = this.time / 60;
    return SPAWN.base + SPAWN.linear * minutes + SPAWN.square * minutes * minutes;
  }

  spawn(dt) {
    this.spawnCredit += this.spawnRate() * dt;
    while (this.spawnCredit >= 1) {
      this.spawnCredit -= 1;
      if (this.enemies.length >= SPAWN.maxAlive) continue;
      const p = this.player;
      const ahead = p.moving && this.rng() < SPAWN.ahead;
      const angle = ahead
        ? p.facing + this.rng.range(-SPAWN.aheadSpread, SPAWN.aheadSpread)
        : undefined;
      this.addEnemy(this.rng.weighted(this.waveMix()), this.edgePoint(angle));
    }

    if (this.time >= this.nextRing) {
      this.nextRing += SPAWN.ringEvery;
      this.events.push({ t: 'ring' });
      const radius = this.halfDiagonal * 0.8;
      for (let i = 0; i < SPAWN.ringCount; i += 1) {
        const angle = (i / SPAWN.ringCount) * TAU;
        this.addEnemy('gnat', {
          x: this.player.x + Math.cos(angle) * radius,
          y: this.player.y + Math.sin(angle) * radius,
        });
      }
    }

    while (this.elitesLeft.length && this.time >= this.elitesLeft[0]) {
      this.elitesLeft.shift();
      this.addEnemy('moth', this.edgePoint());
      this.events.push({ t: 'elite' });
    }

    if (!this.bossSpawned && this.time >= SPAWN.boss) {
      this.bossSpawned = true;
      this.addEnemy('queen', this.edgePoint());
      this.events.push({ t: 'boss' });
    }
  }

  /** A point just outside the screen, on any side. */
  edgePoint(angle = this.rng() * TAU) {
    const distance = this.halfDiagonal + SPAWN.margin;
    return {
      x: this.player.x + Math.cos(angle) * distance,
      y: this.player.y + Math.sin(angle) * distance,
    };
  }

  addEnemy(kind, at) {
    const def = ENEMIES[kind];
    // The cap bends for rings and broods, but it does not break.
    if (!def.elite && !def.boss
        && this.enemies.length >= SPAWN.maxAlive + SPAWN.extraAlive) return null;
    const minutes = this.time / 60;
    const hp = def.hp * (1 + ENEMY_SCALING.hpPerMinute * minutes);
    const enemy = {
      kind, def, x: at.x, y: at.y,
      hp, maxHp: hp, r: def.radius,
      speed: def.speed * this.rng.range(0.9, 1.1)
        * (1 + ENEMY_SCALING.speedPerMinute * minutes),
      damage: def.damage * (1 + ENEMY_SCALING.damagePerMinute * minutes),
      mass: def.mass,
      pushX: 0, pushY: 0,
      flash: 0, phase: this.rng() * TAU,
      fire: def.fireEvery ? this.rng.range(0.5, def.fireEvery) : 0,
      summon: def.summonEvery || 0,
      haloAt: 0, emberAt: 0,
      dead: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  // ----------------------------------------------------------- enemies --

  moveEnemies(dt) {
    const p = this.player;
    const leash = this.halfDiagonal * SPAWN.leash;
    const damp = Math.exp(-6 * dt);
    for (const e of this.enemies) {
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const distance = Math.hypot(dx, dy) || 1;
      dx /= distance;
      dy /= distance;

      // Left far behind: bring it back round in front, rather than let the
      // swarm thin out because the player ran.
      if (distance > leash && !e.def.boss) {
        const ahead = p.moving ? p.facing + this.rng.range(-0.9, 0.9) : undefined;
        const at = this.edgePoint(ahead);
        e.x = at.x;
        e.y = at.y;
        continue;
      }

      // Stragglers hurry back into the fight, so the swarm stays on screen
      // and cannot simply be left behind.
      let speed = e.speed;
      if (distance > this.halfDiagonal * ENEMY_SCALING.catchUpFrom) speed *= ENEMY_SCALING.catchUp;
      let mx = dx;
      let my = dy;
      if (e.def.weave) {
        // Wasps swing side to side as they come, so they are harder to line up.
        e.phase += dt * 4;
        const side = Math.sin(e.phase) * e.def.weave;
        mx = dx - dy * side;
        my = dy + dx * side;
        const length = Math.hypot(mx, my) || 1;
        mx /= length;
        my /= length;
      }
      if (e.def.keepAway) {
        // Spitters hold off at range and lob shots instead of closing in.
        if (distance < e.def.keepAway * 0.8) {
          mx = -dx;
          my = -dy;
        } else if (distance < e.def.keepAway) {
          speed *= 0.2;
        }
        e.fire -= dt;
        if (e.fire <= 0 && distance < e.def.fireRange) {
          e.fire = e.def.fireEvery;
          this.spits.push({
            x: e.x, y: e.y, r: 6, life: 4,
            vx: dx * e.def.shotSpeed, vy: dy * e.def.shotSpeed,
            damage: e.def.shotDamage * (1 + ENEMY_SCALING.damagePerMinute * this.time / 60),
          });
          this.events.push({ t: 'spit', x: e.x, y: e.y });
        }
      }
      if (e.def.summonEvery) {
        e.summon -= dt;
        if (e.summon <= 0) {
          e.summon = e.def.summonEvery;
          for (let i = 0; i < e.def.summonCount; i += 1) {
            const angle = (i / e.def.summonCount) * TAU;
            this.addEnemy('gnat', {
              x: e.x + Math.cos(angle) * (e.r + 14),
              y: e.y + Math.sin(angle) * (e.r + 14),
            });
          }
          this.events.push({ t: 'summon', x: e.x, y: e.y });
        }
      }

      e.x += (mx * speed + e.pushX) * dt;
      e.y += (my * speed + e.pushY) * dt;
      e.pushX *= damp;
      e.pushY *= damp;
      e.flash = Math.max(0, e.flash - dt);
    }
  }

  rebuildGrid() {
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
  }

  /** Soft push between overlapping bugs, so the swarm reads as a crowd. */
  separate() {
    const near = this.near;
    for (const a of this.enemies) {
      this.grid.query(a.x, a.y, a.r + 24, near);
      for (const b of near) {
        if (b === a || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const reach = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const overlap = (reach - d) * 0.5;
        const share = b.mass / (a.mass + b.mass);
        a.x -= (dx / d) * overlap * share;
        a.y -= (dy / d) * overlap * share;
      }
    }
  }

  /**
   * @returns {boolean} true if the hit killed it
   */
  hurtEnemy(e, base) {
    if (e.dead) return false;
    const amount = base * this.stats.damage;
    e.hp -= amount;
    e.flash = 0.08;
    this.events.push({ t: 'hit', x: e.x, y: e.y - e.r, amount: Math.round(amount) });
    if (e.hp > 0) return false;
    this.killEnemy(e);
    return true;
  }

  killEnemy(e, drops = true) {
    e.dead = true;
    if (!drops) return;
    this.kills += 1;
    this.events.push({ t: 'kill', x: e.x, y: e.y, kind: e.kind, r: e.r });
    this.dropGem('xp', e.x, e.y, e.def.xp);
    const gold = e.def.gold;
    const pieces = gold >= 1 ? gold : (this.rng() < gold ? 1 : 0);
    for (let i = 0; i < pieces; i += 1) {
      this.dropGem('gold', e.x + this.rng.range(-e.r, e.r), e.y + this.rng.range(-e.r, e.r), 1);
    }
    if (e.def.elite || e.def.boss) this.dropGem('berry', e.x, e.y, 30);
  }

  // ----------------------------------------------------------- weapons --

  weaponLevel(id) {
    const owned = this.weapons.get(id);
    return owned ? owned.level : 0;
  }

  stat(id, name) {
    return WEAPONS[id][name][this.weaponLevel(id) - 1];
  }

  fireWeapons(dt) {
    const cooldown = this.stats.cooldown;
    for (const [id, w] of this.weapons) {
      if (id === 'halo') {
        this.spinHalo(dt);
        continue;
      }
      w.timer -= dt;
      if (id === 'embers' && !this.player.moving) continue;
      if (w.timer > 0) continue;
      w.timer += this.stat(id, 'cooldown') * cooldown;
      if (w.timer < 0) w.timer = 0;
      if (id === 'spark') this.fireSpark();
      else if (id === 'pulse') this.firePulse();
      else if (id === 'arc') this.fireArc();
      else if (id === 'embers') this.dropEmber();
    }
  }

  nearest(x, y, range, skip) {
    let best = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (e.dead || (skip && skip.has(e))) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  fireSpark() {
    const p = this.player;
    const count = this.stat('spark', 'count');
    const target = this.nearest(p.x, p.y, WEAPONS.spark.range);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.facing;
    for (let i = 0; i < count; i += 1) {
      const angle = base + (i - (count - 1) / 2) * 0.16;
      this.shots.push({
        x: p.x, y: p.y, r: WEAPONS.spark.radius,
        vx: Math.cos(angle) * WEAPONS.spark.speed,
        vy: Math.sin(angle) * WEAPONS.spark.speed,
        damage: this.stat('spark', 'damage'),
        pierce: this.stat('spark', 'pierce'),
        life: 1.4, hit: new Set(),
      });
    }
    this.events.push({ t: 'spark' });
  }

  spinHalo(dt) {
    const p = this.player;
    this.haloAngle += this.stat('halo', 'spin') * dt;
    const orbs = this.stat('halo', 'orbs');
    const orbit = this.stat('halo', 'area') * this.stats.area;
    const reach = WEAPONS.halo.radius;
    const near = this.near;
    for (let i = 0; i < orbs; i += 1) {
      const angle = this.haloAngle + (i / orbs) * TAU;
      const ox = p.x + Math.cos(angle) * orbit;
      const oy = p.y + Math.sin(angle) * orbit;
      // The orbs are a shield too: a spit that meets one is gone.
      for (const spit of this.spits) {
        const r = reach + spit.r;
        if ((spit.x - ox) ** 2 + (spit.y - oy) ** 2 < r * r) spit.life = 0;
      }
      this.grid.query(ox, oy, reach + 30, near);
      for (const e of near) {
        if (e.dead || e.haloAt > this.time) continue;
        const r = reach + e.r;
        if ((e.x - ox) ** 2 + (e.y - oy) ** 2 > r * r) continue;
        e.haloAt = this.time + WEAPONS.halo.rehit;
        this.hurtEnemy(e, this.stat('halo', 'damage'));
      }
    }
  }

  /** Where the halo orbs are now -- the renderer draws them here. */
  haloOrbs() {
    if (!this.weapons.has('halo')) return [];
    const p = this.player;
    const orbs = this.stat('halo', 'orbs');
    const orbit = this.stat('halo', 'area') * this.stats.area;
    const list = [];
    for (let i = 0; i < orbs; i += 1) {
      const angle = this.haloAngle + (i / orbs) * TAU;
      list.push({ x: p.x + Math.cos(angle) * orbit, y: p.y + Math.sin(angle) * orbit,
                  r: WEAPONS.halo.radius });
    }
    return list;
  }

  firePulse() {
    const p = this.player;
    const radius = this.stat('pulse', 'area') * this.stats.area;
    const damage = this.stat('pulse', 'damage');
    const near = this.grid.query(p.x, p.y, radius + 50, this.near);
    for (const e of near) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > radius + e.r) continue;
      if (!this.hurtEnemy(e, damage)) {
        const kick = WEAPONS.pulse.knockback / Math.sqrt(e.mass);
        e.pushX += (dx / d) * kick;
        e.pushY += (dy / d) * kick;
      }
    }
    // A pulse also blows away the spitters' shots inside it.
    for (const spit of this.spits) {
      if ((spit.x - p.x) ** 2 + (spit.y - p.y) ** 2 < radius * radius) spit.life = 0;
    }
    this.pulses.push({ x: p.x, y: p.y, r: radius, life: 0.35, max: 0.35 });
    this.events.push({ t: 'pulse' });
  }

  fireArc() {
    const p = this.player;
    let from = { x: p.x, y: p.y };
    const hit = new Set();
    const points = [{ x: p.x, y: p.y }];
    const jump = this.stat('arc', 'area') * this.stats.area;
    let target = this.nearest(p.x, p.y, WEAPONS.arc.range);
    for (let i = 0; i < this.stat('arc', 'chains') && target; i += 1) {
      hit.add(target);
      points.push({ x: target.x, y: target.y });
      this.hurtEnemy(target, this.stat('arc', 'damage'));
      from = target;
      target = this.nearest(from.x, from.y, jump, hit);
    }
    if (points.length > 1) {
      this.arcs.push({ points, life: 0.18, max: 0.18 });
      this.events.push({ t: 'arc' });
    }
  }

  dropEmber() {
    const p = this.player;
    this.embers.push({
      x: p.x + this.rng.range(-4, 4), y: p.y + this.rng.range(-4, 4),
      r: this.stat('embers', 'area') * this.stats.area,
      damage: this.stat('embers', 'damage'),
      life: this.stat('embers', 'life'), max: this.stat('embers', 'life'),
    });
  }

  burnEmbers(dt) {
    const near = this.near;
    for (const ember of this.embers) {
      ember.life -= dt;
      this.grid.query(ember.x, ember.y, ember.r + 30, near);
      for (const e of near) {
        if (e.dead || e.emberAt > this.time) continue;
        const r = ember.r + e.r;
        if ((e.x - ember.x) ** 2 + (e.y - ember.y) ** 2 > r * r) continue;
        e.emberAt = this.time + WEAPONS.embers.tick;
        this.hurtEnemy(e, ember.damage);
      }
    }
  }

  moveShots(dt) {
    const near = this.near;
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) continue;
      this.grid.query(s.x, s.y, s.r + 50, near);
      for (const e of near) {
        if (e.dead || s.hit.has(e)) continue;
        const r = s.r + e.r;
        if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r * r) continue;
        s.hit.add(e);
        this.hurtEnemy(e, s.damage);
        if (s.pierce <= 0) {
          s.life = 0;
          break;
        }
        s.pierce -= 1;
      }
    }
  }

  moveSpits(dt) {
    const p = this.player;
    for (const s of this.spits) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const r = s.r + p.r;
      if (s.life > 0 && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < r * r) {
        s.life = 0;
        this.hurtPlayer(s.damage);
      }
    }
  }

  // ------------------------------------------------------------ player --

  touchPlayer() {
    const p = this.player;
    const near = this.grid.query(p.x, p.y, p.r + 50, this.near);
    for (const e of near) {
      if (e.dead) continue;
      const r = p.r + e.r;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r * r) continue;
      this.hurtPlayer(e.damage);
      if (this.over) return;
    }
  }

  hurtPlayer(amount) {
    const p = this.player;
    if (p.inv > 0 || this.over) return;
    p.hp -= amount;
    p.inv = PLAYER.invulnerable;
    p.hurt = 0.25;
    this.events.push({ t: 'hurt', amount });
    if (p.hp <= 0) {
      p.hp = 0;
      this.over = true;
      this.events.push({ t: 'death' });
    }
  }

  // ------------------------------------------------------------- gems --

  dropGem(kind, x, y, value) {
    if (kind === 'xp' && this.gems.length >= MAX_GEMS) {
      // Too much dew on the ground: fold it into the oldest drop instead of
      // growing the list without end.
      const oldest = this.gems.find((g) => g.kind === 'xp');
      if (oldest) {
        oldest.value += value;
        return;
      }
    }
    this.gems.push({ kind, x, y, value, pulled: false, age: 0 });
  }

  collectGems(dt) {
    const p = this.player;
    const magnet = this.stats.magnet;
    for (const g of this.gems) {
      g.age += dt;
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (!g.pulled && d < magnet) g.pulled = true;
      if (g.pulled) {
        const speed = 260 + g.age * 60 + this.stats.speed;
        const stepLength = Math.min(d, speed * dt);
        g.x += (dx / (d || 1)) * stepLength;
        g.y += (dy / (d || 1)) * stepLength;
      }
      if (d < PLAYER.pickup + p.r) {
        g.taken = true;
        this.take(g);
      }
    }
  }

  take(gem) {
    if (gem.kind === 'xp') {
      this.xp += gem.value;
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level += 1;
        this.xpNext = xpToNext(this.level);
        this.pendingLevels += 1;
        this.events.push({ t: 'level' });
      }
      this.events.push({ t: 'dew' });
    } else if (gem.kind === 'gold') {
      this.amber += gem.value;
      this.events.push({ t: 'amber' });
    } else {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + gem.value);
      this.events.push({ t: 'berry' });
    }
  }

  /** Pull every gem on the ground in at once (the dawn sweep). */
  vacuum() {
    for (const g of this.gems) {
      if (!g.taken) {
        g.taken = true;
        this.take(g);
      }
    }
    this.gems.length = 0;
  }

  fade(dt) {
    for (const pulse of this.pulses) pulse.life -= dt;
    for (const arc of this.arcs) arc.life -= dt;
  }

  /** Drop everything that finished this step. */
  reap() {
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.shots = this.shots.filter((s) => s.life > 0);
    this.spits = this.spits.filter((s) => s.life > 0);
    this.embers = this.embers.filter((e) => e.life > 0);
    this.gems = this.gems.filter((g) => !g.taken);
    this.pulses = this.pulses.filter((p) => p.life > 0);
    this.arcs = this.arcs.filter((a) => a.life > 0);
  }

  // ---------------------------------------------------------- level-up --

  /**
   * Up to three things to take at a level-up: a new weapon or passive while
   * there are free slots, or the next level of one already held.
   */
  offerChoices(previous = []) {
    const options = [];
    const consider = (kind, ids, owned, slots) => {
      for (const id of ids) {
        const level = owned.get(id) ? (kind === 'weapon' ? owned.get(id).level : owned.get(id)) : 0;
        if (level >= MAX_LEVEL) continue;
        if (!level && owned.size >= slots) continue;
        options.push({ kind, id, level: level + 1, weight: level ? 1.25 : 1 });
      }
    };
    consider('weapon', WEAPON_IDS, this.weapons, SLOTS.weapons);
    consider('passive', PASSIVE_IDS, this.passives, SLOTS.passives);
    if (!options.length) return [{ kind: 'heal', id: 'honey', level: 0 }];

    // A reroll should show something different where it can.
    const fresh = options.filter((o) => !previous.some((p) => p.id === o.id));
    const pool = fresh.length >= 3 ? fresh : options;
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const weights = {};
      pool.forEach((option, i) => { weights[i] = option.weight; });
      const index = Number(this.rng.weighted(weights));
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked.map(({ kind, id, level }) => ({ kind, id, level }));
  }

  choose(choice) {
    if (this.pendingLevels <= 0) return;
    if (choice.kind === 'weapon') {
      const held = this.weapons.get(choice.id);
      if (held) held.level = Math.min(MAX_LEVEL, held.level + 1);
      else this.weapons.set(choice.id, { level: 1, timer: 0.2 });
    } else if (choice.kind === 'passive') {
      this.passives.set(choice.id, Math.min(MAX_LEVEL, this.passive(choice.id) + 1));
    } else {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
      this.amber += 10;
    }
    this.pendingLevels -= 1;
    this.refreshStats();
  }

  // ------------------------------------------------------------ revive --

  /**
   * Back up after dying -- the reward for an ad. Most of the health back,
   * the bugs right around you gone (without drops: it is a rescue, not a
   * payout), and a moment's grace to get clear.
   */
  revive() {
    if (!this.over || this.won || this.revived) return false;
    const p = this.player;
    this.revived = true;
    this.over = false;
    p.hp = p.maxHp * ADS.reviveHeal;
    p.inv = ADS.reviveGrace;
    const clear = ADS.reviveClear;
    for (const e of this.enemies) {
      if (e.def.boss) continue;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < clear * clear) this.killEnemy(e, false);
    }
    this.spits.length = 0;
    this.reap();
    this.pulses.push({ x: p.x, y: p.y, r: clear, life: 0.6, max: 0.6 });
    this.events.push({ t: 'revive' });
    return true;
  }

  /** A plain summary for the result screen. */
  summary() {
    return {
      time: Math.min(this.time, DAWN),
      level: this.level,
      kills: this.kills,
      amber: this.amber,
      won: this.won,
    };
  }
}
