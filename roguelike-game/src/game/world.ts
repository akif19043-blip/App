import type { SfxName } from '../audio/sfx';
import { TAU, circlesOverlap, clamp } from '../engine/math';
import { Pool } from '../engine/pool';
import { Rng } from '../engine/rng';
import { SpatialGrid } from '../engine/spatialGrid';
import { Enemy } from '../entities/enemy';
import { Effect, type EffectKind, Floater, Particle, colorId } from '../entities/fx';
import { Pickup, type PickupKind } from '../entities/pickup';
import { Player } from '../entities/player';
import { EnemyBullet, Projectile } from '../entities/projectile';
import { BEHAVIORS } from '../weapons/behaviors';
import { type DamageRoll, knockback, mitigate, rollDamage } from '../weapons/damage';
import { MAX_WEAPONS, SYNERGIES, type SynergyId, type WeaponId, activeSynergies } from '../weapons/defs';
import { WeaponInstance } from '../weapons/weapon';
import { ENEMIES, type EnemyKind, MAX_ENEMY_RADIUS } from './enemies';
import { type MetaRanks, applyMeta, startingRerolls } from './meta';
import { type XpState, addXp } from './progression';
import { BASE_STATS, type PlayerStats, cloneStats } from './stats';
import { type Card, type Loadout, type PassiveId, passiveDef } from './upgrades';
import { type SpawnRequest, WaveDirector, damageScale, hpScale } from './waves';

export const ARENA_W = 3200;
export const ARENA_H = 3200;
const CELL = 64;

export const CAPACITY = {
  enemies: 2600,
  projectiles: 2000,
  enemyBullets: 1200,
  pickups: 2500,
  particles: 6000,
  floaters: 160,
  effects: 256,
};

/** Hooks the simulation uses to talk to audio / camera / UI. */
export interface WorldEvents {
  sfx(name: SfxName, intensity?: number): void;
  shake(amount: number): void;
  announce(title: string, subtitle: string, color: string): void;
}

export const SILENT_EVENTS: WorldEvents = { sfx() {}, shake() {}, announce() {} };

export type RunStatus = 'running' | 'dead' | 'won';

/**
 * The whole game simulation. It knows nothing about canvas, DOM or audio,
 * so it can be stepped headlessly in unit tests.
 */
export class World {
  readonly rng: Rng;
  readonly player = new Player();
  readonly enemies = new Pool(() => new Enemy(), CAPACITY.enemies);
  readonly projectiles = new Pool(() => new Projectile(), CAPACITY.projectiles);
  readonly enemyBullets = new Pool(() => new EnemyBullet(), CAPACITY.enemyBullets);
  readonly pickups = new Pool(() => new Pickup(), CAPACITY.pickups);
  readonly particles = new Pool(() => new Particle(), CAPACITY.particles);
  readonly floaters = new Pool(() => new Floater(), CAPACITY.floaters);
  readonly effects = new Pool(() => new Effect(), CAPACITY.effects);
  readonly grid = new SpatialGrid(ARENA_W, ARENA_H, CELL, CAPACITY.enemies);
  private readonly director: WaveDirector;
  private readonly spawns: SpawnRequest[] = [];
  private readonly scratch = new Int32Array(4096);
  private readonly roll: DamageRoll = { amount: 0, crit: false };

  time = 0;
  kills = 0;
  gold = 0;
  damageDealt = 0;
  status: RunStatus = 'running';
  readonly xp: XpState = { level: 1, xp: 0 };
  /** Level-ups (and chest rewards) waiting for the player to pick a card. */
  pendingLevelUps = 0;
  rerolls: number;
  readonly baseStats: PlayerStats;
  stats: PlayerStats;
  readonly passives: Partial<Record<PassiveId, number>> = {};
  readonly weapons: WeaponInstance[] = [];
  synergies = new Set<SynergyId>();
  /** Bosses alive right now, for the boss health bar. */
  readonly bosses: Enemy[] = [];
  /** Movement intent, set by the app every step. */
  readonly moveInput = { x: 0, y: 0 };
  /** Visible world size, set by the app, used to spawn enemies off-screen. */
  viewW = 1280;
  viewH = 720;
  /** Red screen flash after taking damage, in [0, 1]. */
  hurtFlash = 0;
  /** Name of whatever last damaged the player (shown on the death screen). */
  lastHitBy = '';
  stormCd = 0;
  private nextUid = 1;
  private wonTimer = -1;
  private gemStreak = 0;
  private gemStreakTimer = 0;

  constructor(
    readonly fx: WorldEvents = SILENT_EVENTS,
    meta: MetaRanks = {},
    seed?: number,
    startWeapon: WeaponId = 'wand',
  ) {
    this.rng = new Rng(seed);
    this.director = new WaveDirector(this.rng);
    this.baseStats = applyMeta(BASE_STATS, meta);
    this.stats = cloneStats(this.baseStats);
    this.rerolls = startingRerolls(meta);
    this.player.reset(ARENA_W / 2, ARENA_H / 2, this.stats.maxHp);
    this.weapons.push(new WeaponInstance(startWeapon, 1, this.stats));
  }

  get level(): number {
    return this.xp.level;
  }

  loadout(): Loadout {
    return { weapons: this.weapons.map((w) => ({ id: w.id, level: w.level })), passives: this.passives };
  }

  // ---------------------------------------------------------------- step

  update(dt: number): void {
    if (this.status !== 'running') return;
    this.time += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.stormCd -= dt;
    this.gemStreakTimer -= dt;
    if (this.gemStreakTimer <= 0) this.gemStreak = 0;

    this.updatePlayer(dt);
    this.spawnEnemies(dt);
    this.buildGrid();
    this.updateEnemies(dt);
    for (const w of this.weapons) BEHAVIORS[w.id](this, w, dt);
    this.updateProjectiles(dt);
    this.updateEnemyBullets(dt);
    this.contactDamage();
    this.updatePickups(dt);
    this.updateFx(dt);

    this.enemies.compact();
    this.projectiles.compact();
    this.enemyBullets.compact();
    this.pickups.compact();
    this.particles.compact();
    this.floaters.compact();
    this.effects.compact();
    for (let i = this.bosses.length - 1; i >= 0; i--) if (!this.bosses[i].active) this.bosses.splice(i, 1);

    if (this.wonTimer > 0) {
      this.wonTimer -= dt;
      if (this.wonTimer <= 0) this.status = 'won';
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    p.move(this.moveInput.x, this.moveInput.y, this.stats.moveSpeed, dt, ARENA_W, ARENA_H);
    p.invuln = Math.max(0, p.invuln - dt);
    if (this.stats.regen > 0 && p.hp > 0) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.regen * dt);
  }

  // ---------------------------------------------------------------- spawning

  private spawnEnemies(dt: number): void {
    this.director.update(dt, this.time, this.enemies.count, this.spawns);
    for (const s of this.spawns) {
      if (s.type === 'enemy') {
        this.spawnOffscreen(s.kind);
      } else if (s.type === 'elite') {
        const e = this.spawnOffscreen('elite');
        if (e) this.fx.announce('ELITE INBOUND', 'Kill it for a treasure core', ENEMIES.elite.color);
      } else if (s.type === 'ring') {
        this.spawnRing(s.kind, s.count);
        this.fx.announce('SWARM!', 'They are surrounding you', ENEMIES[s.kind].color);
      } else {
        const e = this.spawnOffscreen('boss');
        if (e) {
          e.maxHp = e.hp = e.hp * s.hpMult;
          e.name = s.name;
          e.finalBoss = s.final;
          if (s.final) {
            e.radius *= 1.35;
            e.speed *= 1.1;
          }
          this.bosses.push(e);
          this.fx.announce(s.name, s.final ? 'Destroy it to win' : 'A boss approaches', ENEMIES.boss.color);
          this.fx.sfx('boss');
          this.fx.shake(0.5);
        }
      }
    }
  }

  private spawnPoint(out: { x: number; y: number }): void {
    const p = this.player;
    const halfDiag = Math.hypot(this.viewW, this.viewH) / 2 + 50;
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rng.next() * TAU;
      const d = halfDiag + this.rng.next() * 120;
      out.x = clamp(p.x + Math.cos(a) * d, 30, ARENA_W - 30);
      out.y = clamp(p.y + Math.sin(a) * d, 30, ARENA_H - 30);
      const offX = Math.abs(out.x - p.x) > this.viewW / 2 + 20;
      const offY = Math.abs(out.y - p.y) > this.viewH / 2 + 20;
      if (offX || offY) return;
    }
  }

  private readonly spawnPos = { x: 0, y: 0 };

  private spawnOffscreen(kind: EnemyKind): Enemy | null {
    this.spawnPoint(this.spawnPos);
    return this.spawnEnemy(kind, this.spawnPos.x, this.spawnPos.y);
  }

  private spawnRing(kind: EnemyKind, count: number): void {
    const p = this.player;
    const r = Math.hypot(this.viewW, this.viewH) / 2 + 30;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      this.spawnEnemy(kind, clamp(p.x + Math.cos(a) * r, 20, ARENA_W - 20), clamp(p.y + Math.sin(a) * r, 20, ARENA_H - 20));
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy | null {
    const e = this.enemies.obtain();
    if (!e) return null;
    const def = ENEMIES[kind];
    const hs = hpScale(this.time);
    e.uid = this.nextUid++;
    e.def = def;
    e.x = e.px = x;
    e.y = e.py = y;
    e.kvx = e.kvy = 0;
    e.maxHp = e.hp = Math.ceil(def.hp * hs);
    e.radius = def.radius;
    e.speed = def.speed * (0.9 + this.rng.next() * 0.2);
    e.damage = def.damage * damageScale(this.time);
    e.xp = def.xp;
    e.flash = 0;
    e.shootCd = def.ranged ? def.ranged.cooldown * (0.5 + this.rng.next()) : 0;
    e.aiTimer = 2 + this.rng.next() * 2;
    e.dashTime = 0;
    e.orbHitUntil = 0;
    e.slowUntil = 0;
    e.angle = 0;
    e.wobble = this.rng.next() * TAU;
    e.name = def.name;
    e.finalBoss = false;
    return e;
  }

  private buildGrid(): void {
    const g = this.grid;
    const items = this.enemies.items;
    g.begin();
    for (let i = 0; i < this.enemies.count; i++) {
      const e = items[i];
      if (e.active) g.add(i, e.x, e.y);
    }
    g.end();
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number): void {
    const p = this.player;
    const items = this.enemies.items;
    const scratch = this.scratch;
    const kDecay = Math.exp(-7 * dt);
    const t = this.time;
    for (let i = 0; i < this.enemies.count; i++) {
      const e = items[i];
      if (!e.active) continue;
      e.px = e.x;
      e.py = e.y;
      e.flash -= dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      let nx = dx / d;
      let ny = dy / d;
      let speed = e.speed * (e.slowUntil > t ? 0.55 : 1);
      const def = e.def;

      if (def.kind === 'swarmer') {
        // A little sideways weave makes swarms feel alive.
        const w = Math.sin(t * 5 + e.wobble) * 0.35;
        const tx = nx - ny * w;
        const ty = ny + nx * w;
        const l = Math.hypot(tx, ty);
        nx = tx / l;
        ny = ty / l;
      }

      if (def.ranged) {
        e.shootCd -= dt;
        if (def.kind === 'spitter') {
          if (d < def.ranged.range * 0.6) speed *= -0.6; // back off
          else if (d < def.ranged.range) speed = 0;
          if (e.shootCd <= 0 && d < def.ranged.range * 1.1) {
            e.shootCd = def.ranged.cooldown;
            this.fireEnemyBullet(e.x, e.y, Math.atan2(dy, dx), def.ranged.bulletSpeed, def.ranged.bulletDamage, def.name);
            this.fx.sfx('spit');
          }
        } else if (e.shootCd <= 0 && d < def.ranged.range) {
          // Boss radial burst; the final boss spirals and summons.
          e.shootCd = def.ranged.cooldown * (e.finalBoss ? 0.7 : 1);
          const n = e.finalBoss ? 22 : 14;
          const off = t * 0.7;
          for (let k = 0; k < n; k++) {
            this.fireEnemyBullet(e.x, e.y, off + (k / n) * TAU, def.ranged.bulletSpeed, def.ranged.bulletDamage, e.name);
          }
          if (e.finalBoss) {
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * TAU;
              this.spawnEnemy('swarmer', e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80);
            }
          }
          this.fx.sfx('spit', 1.5);
        }
      }

      if (def.kind === 'elite' || def.kind === 'boss') {
        e.aiTimer -= dt;
        if (e.dashTime > 0) {
          e.dashTime -= dt;
          nx = e.dashX;
          ny = e.dashY;
          speed *= 3.2;
        } else if (e.aiTimer <= 0 && d < 700) {
          e.aiTimer = 4.5;
          e.dashTime = 0.55;
          e.dashX = nx;
          e.dashY = ny;
        }
      }

      let mx = nx * speed + e.kvx;
      let my = ny * speed + e.kvy;
      e.kvx *= kDecay;
      e.kvy *= kDecay;

      // Separation: shove away from overlapping neighbours so swarms spread.
      const n = this.grid.query(e.x, e.y, e.radius * 2, scratch);
      let sx = 0;
      let sy = 0;
      let checked = 0;
      for (let k = 0; k < n && checked < 10; k++) {
        const j = scratch[k];
        if (j === i) continue;
        const o = items[j];
        if (!o.active) continue;
        checked++;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const rr = e.radius + o.radius;
        const d2 = ox * ox + oy * oy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const od = Math.sqrt(d2);
        const push = (rr - od) / rr;
        // Heavy enemies barely get pushed by small ones.
        const massRatio = o.radius / (e.radius + o.radius);
        sx += (ox / od) * push * massRatio;
        sy += (oy / od) * push * massRatio;
      }
      mx += sx * 220;
      my += sy * 220;

      e.x += mx * dt;
      e.y += my * dt;

      // Do not overlap the player: stop at the rim.
      const pdx = e.x - p.x;
      const pdy = e.y - p.y;
      const pr = e.radius + p.radius - 4;
      const pd2 = pdx * pdx + pdy * pdy;
      if (pd2 < pr * pr && pd2 > 1e-6) {
        const pd = Math.sqrt(pd2);
        e.x = p.x + (pdx / pd) * pr;
        e.y = p.y + (pdy / pd) * pr;
      }

      e.x = clamp(e.x, e.radius, ARENA_W - e.radius);
      e.y = clamp(e.y, e.radius, ARENA_H - e.radius);
      e.angle = def.kind === 'swarmer' || def.kind === 'grunt' ? Math.atan2(my, mx) : e.angle + dt * (def.kind === 'boss' ? 0.6 : 1.2);
    }
  }

  private fireEnemyBullet(x: number, y: number, ang: number, speed: number, dmg: number, source: string): void {
    const b = this.enemyBullets.obtain();
    if (!b) return;
    b.x = b.px = x;
    b.y = b.py = y;
    b.vx = Math.cos(ang) * speed;
    b.vy = Math.sin(ang) * speed;
    b.damage = dmg * damageScale(this.time);
    b.life = 4.5;
    b.radius = 7;
    b.source = source;
  }

  // ---------------------------------------------------------------- queries

  /**
   * Writes the indices of up to `k` nearest living enemies within `range`
   * into `out`, closest first. Returns how many were found.
   */
  nearestEnemies(x: number, y: number, range: number, k: number, out: Int32Array, exclude?: Projectile): number {
    const items = this.enemies.items;
    const scratch = this.scratch;
    const best = this.bestD;
    k = Math.min(k, out.length, best.length);
    let found = 0;
    // Expand the search box until we have enough candidates or hit range.
    for (let r = Math.min(range, 180); ; r = Math.min(range, r * 2)) {
      found = 0;
      const n = this.grid.query(x, y, r, scratch);
      const r2 = r * r;
      for (let c = 0; c < n; c++) {
        const idx = scratch[c];
        const e = items[idx];
        if (!e.active || e.hp <= 0) continue;
        if (exclude && exclude.hasHit(e.uid)) continue;
        const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d2 > r2) continue;
        // Insertion into the sorted top-k.
        let pos = found < k ? found : k;
        if (pos === k && d2 >= best[k - 1]) continue;
        while (pos > 0 && best[pos - 1] > d2) {
          if (pos < k) {
            best[pos] = best[pos - 1];
            out[pos] = out[pos - 1];
          }
          pos--;
        }
        best[pos] = d2;
        out[pos] = idx;
        if (found < k) found++;
      }
      if (found >= k || r >= range) break;
    }
    return found;
  }
  private readonly bestD = new Float64Array(16);

  forEachEnemyInCircle(x: number, y: number, r: number, fn: (e: Enemy) => void): void {
    const items = this.enemies.items;
    const n = this.grid.query(x, y, r + MAX_ENEMY_RADIUS, this.circleScratch);
    for (let c = 0; c < n; c++) {
      const e = items[this.circleScratch[c]];
      if (!e.active || e.hp <= 0) continue;
      if (circlesOverlap(x, y, r, e.x, e.y, e.radius)) fn(e);
    }
  }
  private readonly circleScratch = new Int32Array(4096);

  /** A random living enemy inside the current view, or null. */
  randomVisibleEnemy(): Enemy | null {
    const count = this.enemies.count;
    if (count === 0) return null;
    const p = this.player;
    const hw = this.viewW / 2;
    const hh = this.viewH / 2;
    for (let tries = 0; tries < 30; tries++) {
      const e = this.enemies.items[this.rng.int(0, count - 1)];
      if (!e.active || e.hp <= 0) continue;
      if (Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh) return e;
    }
    const near = this.nearestEnemies(p.x, p.y, Math.max(hw, hh), 1, this.oneTarget);
    return near > 0 ? this.enemies.items[this.oneTarget[0]] : null;
  }
  private readonly oneTarget = new Int32Array(1);

  // ---------------------------------------------------------------- combat

  fireProjectile(
    weapon: WeaponId, x: number, y: number, ang: number, speed: number, radius: number,
    damage: number, pierce: number, bounces: number, kb: number, life: number,
  ): void {
    const pr = this.projectiles.obtain();
    if (!pr) return;
    pr.weapon = weapon;
    pr.x = pr.px = x;
    pr.y = pr.py = y;
    pr.vx = Math.cos(ang) * speed;
    pr.vy = Math.sin(ang) * speed;
    pr.radius = radius;
    pr.damage = damage;
    pr.pierce = pierce;
    pr.bounces = bounces;
    pr.knockback = kb;
    pr.life = life;
    pr.spin = 0;
    pr.hitCount = 0;
  }

  /** Applies a hit to an enemy. Returns true if it died. */
  hitEnemy(e: Enemy, base: number, kbForce: number, dirX: number, dirY: number, showNumber = true): boolean {
    if (!e.active || e.hp <= 0) return false;
    const r = rollDamage(base, this.stats.crit, this.rng.next(), this.roll);
    e.hp -= r.amount;
    this.damageDealt += r.amount;
    e.flash = 0.1;
    const kb = knockback(kbForce, e.def.kbResist);
    e.kvx += dirX * kb;
    e.kvy += dirY * kb;
    if (showNumber || r.crit) {
      this.floater(e.x, e.y - e.radius, String(r.amount), r.crit ? '#ffe14d' : '#ffffff', r.crit ? 20 : 14);
    }
    this.fx.sfx(r.crit ? 'crit' : 'hit');
    if (e.hp <= 0) {
      this.killEnemy(e);
      return true;
    }
    return false;
  }

  private killEnemy(e: Enemy): void {
    e.active = false;
    this.kills++;
    const def = e.def;
    const big = def.kind === 'boss' || def.kind === 'elite';
    this.burst(e.x, e.y, big ? 60 : 7, def.color, big ? 420 : 200, big ? 0.9 : 0.45, big ? 5 : 3);
    if (big) {
      this.ring(e.x, e.y, e.radius, e.radius * 5, def.color, 0.6, 6);
      this.fx.shake(def.kind === 'boss' ? 0.8 : 0.35);
      this.fx.sfx(def.kind === 'boss' ? 'bossDie' : 'kill', 2);
    } else {
      this.fx.sfx('kill');
    }

    // Drops.
    this.dropPickup('xp', e.x, e.y, e.xp);
    if (this.rng.chance(def.goldChance)) {
      const amt = def.kind === 'boss' ? 60 : def.kind === 'elite' ? 15 : 1 + this.rng.int(0, 2);
      this.dropPickup('gold', e.x + this.rng.range(-8, 8), e.y + this.rng.range(-8, 8), amt);
    }
    if (big) {
      this.dropPickup('chest', e.x, e.y, def.kind === 'boss' ? 2 : 1);
    } else {
      if (this.rng.chance(0.006)) this.dropPickup('heal', e.x, e.y, 0.25);
      if (this.rng.chance(0.0012)) this.dropPickup('vacuum', e.x, e.y, 0);
    }

    if (e.finalBoss) {
      this.fx.announce('VICTORY', 'The Overmind has fallen', '#ffe14d');
      this.fx.sfx('victory');
      // Everything else dies with it.
      for (let i = 0; i < this.enemies.count; i++) {
        const o = this.enemies.items[i];
        if (!o.active) continue;
        o.active = false;
        this.burst(o.x, o.y, 4, o.def.color, 220, 0.5, 3);
      }
      this.wonTimer = 2.5;
    }
  }

  strikeLightning(x: number, y: number, damage: number, radius: number): void {
    const e = this.effects.obtain();
    if (e) {
      e.kind = 'bolt';
      e.x = x + this.rng.range(-60, 60);
      e.y = y - 520;
      e.x2 = x;
      e.y2 = y;
      e.life = e.maxLife = 0.22;
      e.color = '#fff36b';
      e.width = 4;
      // Jagged path from sky to target.
      const segs = 11;
      e.npts = segs + 1;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const jitter = i === 0 || i === segs ? 0 : this.rng.range(-26, 26);
        e.pts[i * 2] = e.x + (x - e.x) * t + jitter;
        e.pts[i * 2 + 1] = e.y + (y - e.y) * t;
      }
    }
    this.ring(x, y, 8, radius, '#fff36b', 0.3, 3);
    this.burst(x, y, 10, '#fff9b0', 260, 0.35, 2.5);
    this.fx.sfx('zap');
    this.fx.shake(0.06);
    this.forEachEnemyInCircle(x, y, radius, (en) => {
      const dx = en.x - x;
      const dy = en.y - y;
      const d = Math.hypot(dx, dy) || 1;
      this.hitEnemy(en, damage, 140, dx / d, dy / d);
    });
  }

  private updateProjectiles(dt: number): void {
    const items = this.projectiles.items;
    const enemies = this.enemies.items;
    const scratch = this.scratch;
    for (let i = 0; i < this.projectiles.count; i++) {
      const pr = items[i];
      if (!pr.active) continue;
      pr.px = pr.x;
      pr.py = pr.y;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      pr.spin += dt * 18;
      if (pr.life <= 0 || pr.x < -50 || pr.y < -50 || pr.x > ARENA_W + 50 || pr.y > ARENA_H + 50) {
        pr.active = false;
        continue;
      }
      const n = this.grid.query(pr.x, pr.y, pr.radius + MAX_ENEMY_RADIUS, scratch);
      for (let c = 0; c < n; c++) {
        const e = enemies[scratch[c]];
        if (!e.active || e.hp <= 0 || pr.hasHit(e.uid)) continue;
        if (!circlesOverlap(pr.x, pr.y, pr.radius, e.x, e.y, e.radius)) continue;
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        pr.markHit(e.uid);
        this.hitEnemy(e, pr.damage, pr.knockback, pr.vx / sp, pr.vy / sp);
        this.burst(pr.x, pr.y, 3, pr.weapon === 'daggers' ? '#ffb37a' : '#aef9ff', 160, 0.2, 2);
        if (pr.pierce > 0) {
          pr.pierce--;
          continue;
        }
        if (pr.bounces > 0 && this.bounce(pr, sp)) break;
        pr.active = false;
        break;
      }
    }
  }

  /** Redirects a projectile to the nearest enemy it has not hit yet. */
  private bounce(pr: Projectile, speed: number): boolean {
    const n = this.nearestEnemies(pr.x, pr.y, 340, 1, this.oneTarget, pr);
    if (n === 0) return false;
    const t = this.enemies.items[this.oneTarget[0]];
    const a = Math.atan2(t.y - pr.y, t.x - pr.x);
    pr.vx = Math.cos(a) * speed;
    pr.vy = Math.sin(a) * speed;
    pr.bounces--;
    pr.life = Math.max(pr.life, 0.7);
    if (pr.weapon === 'daggers' && this.synergies.has('thunderBlades')) {
      this.spark(pr.x, pr.y, t.x, t.y);
      this.forEachEnemyInCircle(pr.x, pr.y, 45, (en) => this.hitEnemy(en, pr.damage * 0.4, 30, 0, 0, false));
    }
    return true;
  }

  private updateEnemyBullets(dt: number): void {
    const p = this.player;
    const items = this.enemyBullets.items;
    for (let i = 0; i < this.enemyBullets.count; i++) {
      const b = items[i];
      if (!b.active) continue;
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > ARENA_W || b.y > ARENA_H) {
        b.active = false;
        continue;
      }
      if (circlesOverlap(b.x, b.y, b.radius, p.x, p.y, p.radius - 3)) {
        b.active = false;
        this.damagePlayer(b.damage, b.source);
      }
    }
  }

  private contactDamage(): void {
    const p = this.player;
    if (p.invuln > 0) return;
    const items = this.enemies.items;
    const n = this.grid.query(p.x, p.y, p.radius + MAX_ENEMY_RADIUS, this.scratch);
    let worst: Enemy | null = null;
    for (let c = 0; c < n; c++) {
      const e = items[this.scratch[c]];
      if (!e.active) continue;
      if (circlesOverlap(p.x, p.y, p.radius, e.x, e.y, e.radius) && (!worst || e.damage > worst.damage)) worst = e;
    }
    if (worst) this.damagePlayer(worst.damage, worst.name);
  }

  damagePlayer(raw: number, source = 'the swarm'): void {
    const p = this.player;
    if (p.invuln > 0 || this.status !== 'running' || this.wonTimer > 0) return;
    this.lastHitBy = source;
    const dmg = mitigate(raw, this.stats.armor);
    p.hp -= dmg;
    p.invuln = 0.6;
    this.hurtFlash = 1;
    this.floater(p.x, p.y - 24, `-${Math.round(dmg)}`, '#ff4d6d', 18);
    this.burst(p.x, p.y, 10, '#ff4d6d', 220, 0.4, 3);
    this.fx.shake(0.28);
    if (p.hp <= 0) {
      p.hp = 0;
      this.status = 'dead';
      this.burst(p.x, p.y, 80, '#5ef2ff', 420, 1.1, 4);
      this.fx.sfx('death');
      this.fx.shake(1);
    } else {
      this.fx.sfx('hurt');
    }
  }

  // ---------------------------------------------------------------- pickups

  dropPickup(kind: PickupKind, x: number, y: number, value: number): void {
    let pk = this.pickups.obtain();
    if (!pk) {
      if (kind !== 'xp') return;
      // Pool full: merge into an existing gem instead of losing the XP.
      for (let tries = 0; tries < 8; tries++) {
        const o = this.pickups.items[this.rng.int(0, this.pickups.count - 1)];
        if (o.active && o.kind === 'xp') {
          o.value += value;
          return;
        }
      }
      return;
    }
    pk.kind = kind;
    pk.value = value;
    pk.x = x;
    pk.y = y;
    pk.magnet = false;
    pk.speed = 0;
    pk.phase = this.rng.next() * TAU;
    const a = this.rng.next() * TAU;
    const s = kind === 'xp' ? this.rng.range(10, 60) : 90;
    pk.vx = Math.cos(a) * s;
    pk.vy = Math.sin(a) * s;
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const items = this.pickups.items;
    const magnet2 = this.stats.magnet * this.stats.magnet;
    const collect = p.radius + 10;
    const drag = Math.exp(-6 * dt);
    for (let i = 0; i < this.pickups.count; i++) {
      const pk = items[i];
      if (!pk.active) continue;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d2 = dx * dx + dy * dy;
      if (!pk.magnet && d2 < magnet2) pk.magnet = true;
      if (pk.magnet) {
        const d = Math.sqrt(d2) || 1;
        pk.speed = Math.min(1400, pk.speed + 1600 * dt);
        const sp = Math.max(pk.speed, Math.hypot(p.vx, p.vy) + 120);
        const step = Math.min(d, sp * dt);
        pk.x += (dx / d) * step;
        pk.y += (dy / d) * step;
      } else {
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.vx *= drag;
        pk.vy *= drag;
      }
      if (d2 < collect * collect) {
        pk.active = false;
        this.collect(pk);
      }
    }
  }

  private collect(pk: Pickup): void {
    const p = this.player;
    switch (pk.kind) {
      case 'xp': {
        const gained = addXp(this.xp, pk.value * this.stats.xpGain);
        this.gemStreak = Math.min(24, this.gemStreak + 1);
        this.gemStreakTimer = 0.45;
        this.fx.sfx('gem', this.gemStreak);
        if (gained > 0) {
          this.pendingLevelUps += gained;
          this.ring(p.x, p.y, 10, 160, '#5ef2ff', 0.5, 4);
        }
        break;
      }
      case 'gold': {
        const amt = Math.max(1, Math.round(pk.value * this.stats.greed));
        this.gold += amt;
        this.floater(p.x, p.y - 28, `+${amt}¤`, '#ffd166', 15);
        this.fx.sfx('gold');
        break;
      }
      case 'heal': {
        const amt = this.stats.maxHp * pk.value;
        p.hp = Math.min(this.stats.maxHp, p.hp + amt);
        this.floater(p.x, p.y - 28, `+${Math.round(amt)}`, '#4dff9d', 18);
        this.burst(p.x, p.y, 16, '#4dff9d', 180, 0.6, 3);
        this.fx.sfx('heal');
        break;
      }
      case 'vacuum': {
        for (let i = 0; i < this.pickups.count; i++) {
          const o = this.pickups.items[i];
          if (o.active && o.kind === 'xp') o.magnet = true;
        }
        this.ring(p.x, p.y, 10, 900, '#5ef2ff', 0.8, 5);
        this.fx.sfx('vacuum');
        break;
      }
      case 'chest': {
        this.pendingLevelUps += pk.value;
        this.gold += 10;
        this.ring(p.x, p.y, 10, 260, '#ffe14d', 0.7, 6);
        this.burst(p.x, p.y, 40, '#ffe14d', 380, 0.9, 4);
        this.fx.announce('TREASURE CORE', `+${pk.value} upgrade${pk.value > 1 ? 's' : ''}`, '#ffe14d');
        this.fx.sfx('chest');
        break;
      }
    }
  }

  // ---------------------------------------------------------------- fx

  burst(x: number, y: number, count: number, color: string, speed: number, life: number, size: number): void {
    const c = colorId(color);
    for (let i = 0; i < count; i++) {
      const pt = this.particles.obtain();
      if (!pt) return;
      const a = this.rng.next() * TAU;
      const s = speed * (0.25 + this.rng.next() * 0.75);
      pt.x = x;
      pt.y = y;
      pt.vx = Math.cos(a) * s;
      pt.vy = Math.sin(a) * s;
      pt.life = pt.maxLife = life * (0.5 + this.rng.next() * 0.5);
      pt.size = size * (0.6 + this.rng.next() * 0.6);
      pt.color = c;
      pt.drag = 3.5;
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life: number, width: number): void {
    this.effect('ring', x, y, 0, 0, r0, r1, color, life, width);
  }

  private spark(x: number, y: number, x2: number, y2: number): void {
    this.effect('spark', x, y, x2, y2, 0, 0, '#fff36b', 0.15, 2);
  }

  private effect(
    kind: EffectKind, x: number, y: number, x2: number, y2: number,
    r0: number, r1: number, color: string, life: number, width: number,
  ): void {
    const e = this.effects.obtain();
    if (!e) return;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.x2 = x2;
    e.y2 = y2;
    e.r0 = r0;
    e.r1 = r1;
    e.color = color;
    e.life = e.maxLife = life;
    e.width = width;
    e.npts = 0;
  }

  floater(x: number, y: number, text: string, color: string, size: number): void {
    const f = this.floaters.obtain();
    if (!f) return;
    f.x = x + this.rng.range(-6, 6);
    f.y = y;
    f.vy = -70;
    f.life = f.maxLife = 0.7;
    f.text = text;
    f.color = color;
    f.size = size;
  }

  private updateFx(dt: number): void {
    const parts = this.particles.items;
    for (let i = 0; i < this.particles.count; i++) {
      const pt = parts[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      const k = Math.exp(-pt.drag * dt);
      pt.vx *= k;
      pt.vy *= k;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    const fl = this.floaters.items;
    for (let i = 0; i < this.floaters.count; i++) {
      const f = fl[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= Math.exp(-4 * dt);
    }
    const ef = this.effects.items;
    for (let i = 0; i < this.effects.count; i++) {
      const e = ef[i];
      e.life -= dt;
      if (e.life <= 0) e.active = false;
    }
  }

  /**
   * Benchmark mode: floods the arena with `count` enemies and makes the
   * player effectively immortal so the renderer and collision grid can be
   * profiled under load (open the game with ?stress=3000).
   */
  stressTest(count: number): void {
    this.baseStats.maxHp = 1e9;
    this.recomputeStats();
    this.player.hp = 1e9;
    const kinds: EnemyKind[] = ['swarmer', 'grunt', 'tank', 'spitter'];
    const p = this.player;
    for (let i = 0; i < count; i++) {
      const a = this.rng.next() * TAU;
      const d = 250 + this.rng.next() * 1300;
      this.spawnEnemy(kinds[i % kinds.length], clamp(p.x + Math.cos(a) * d, 20, ARENA_W - 20), clamp(p.y + Math.sin(a) * d, 20, ARENA_H - 20));
    }
    for (const id of ['orbs', 'lightning', 'daggers'] as const) this.weapons.push(new WeaponInstance(id, 8, this.stats));
    this.weapons[0].level = 8;
    this.recomputeStats();
  }

  /** Advances only visual effects (used while the run is over). */
  tickEffects(dt: number): void {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.updateFx(dt);
    this.particles.compact();
    this.floaters.compact();
    this.effects.compact();
  }

  // ---------------------------------------------------------------- upgrades

  /** Recomputes stats from base + passives, then every weapon and synergy. */
  private recomputeStats(): void {
    const s = cloneStats(this.baseStats);
    for (const [id, rank] of Object.entries(this.passives) as Array<[PassiveId, number]>) {
      const def = passiveDef(id);
      for (let i = 0; i < rank; i++) def.apply(s);
    }
    const hpDelta = s.maxHp - this.stats.maxHp;
    this.stats = s;
    if (hpDelta > 0) this.player.hp += hpDelta;
    this.player.hp = Math.min(this.player.hp, s.maxHp);
    for (const w of this.weapons) w.refresh(s);
    const now = new Set(activeSynergies(this.loadout().weapons));
    for (const id of now) {
      if (!this.synergies.has(id)) {
        const def = SYNERGIES.find((x) => x.id === id)!;
        this.fx.announce(`SYNERGY: ${def.name.toUpperCase()}`, def.desc, '#ff6bd6');
        this.fx.sfx('synergy');
      }
    }
    this.synergies = now;
  }

  applyCard(card: Card): void {
    const p = this.player;
    switch (card.kind) {
      case 'weapon': {
        const owned = this.weapons.find((w) => w.id === card.id);
        if (owned) owned.level = card.level;
        else if (this.weapons.length < MAX_WEAPONS) this.weapons.push(new WeaponInstance(card.id, 1, this.stats));
        break;
      }
      case 'passive':
        this.passives[card.id] = (this.passives[card.id] ?? 0) + 1;
        break;
      case 'heal':
        p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.maxHp * 0.4);
        break;
      case 'gold':
        this.gold += 30;
        break;
    }
    this.recomputeStats();
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    this.fx.sfx('select');
    this.ring(p.x, p.y, 10, 220, card.color, 0.5, 5);
    this.burst(p.x, p.y, 24, card.color, 320, 0.7, 3);
  }

  /** Total live entities, for the debug overlay. */
  entityCount(): number {
    return (
      this.enemies.count + this.projectiles.count + this.enemyBullets.count +
      this.pickups.count + this.particles.count + this.floaters.count + this.effects.count
    );
  }
}
