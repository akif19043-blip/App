import { type Camera } from '../engine/camera';
import { TAU } from '../engine/math';
import { PALETTE } from '../entities/fx';
import { gemTier } from '../entities/pickup';
import { ENEMIES, type EnemyKind } from '../game/enemies';
import { ARENA_H, ARENA_W, type World } from '../game/world';
import { WEAPONS } from '../weapons/defs';
import { type AssetLoader, type SheetSprite } from './assets';
import { creatureSheet, playerSheet, shadowSprite } from './creatures';
import { type SpriteKey, type SpriteRotation, frameAt } from './spriteMeta';
import {
  type Sprite, boltSprite, daggerSprite, gemSprite, glowDot, hexA, iconSprite, setSpriteResolution,
} from './sprites';

const BG = '#06050d';
const GRID = 80;
export const DAMAGE_FONT = '"Chakra Petch", ui-monospace, monospace';

/** Wraps a single-image procedural sprite as a 1-frame sheet. */
function sheetOf(sp: Sprite, rotation: SpriteRotation): SheetSprite {
  const w = sp.canvas.width;
  return {
    image: sp.canvas, flash: sp.canvas, frameW: w, frameH: sp.canvas.height, frames: 1, cols: 1, fps: 1,
    scale: 1, rotation, angle: 0, pixelated: false, worldSize: sp.half * 2,
  };
}

const ATTRACT_KINDS: EnemyKind[] = ['swarmer', 'grunt', 'swarmer', 'spitter', 'tank', 'swarmer', 'grunt', 'elite'];

/**
 * Canvas 2D renderer. Reads the world, never mutates it.
 *
 * Every entity is drawn through `drawSheet`, which accepts either a PNG
 * loaded by the AssetLoader or the procedural fallback art, so dropping a
 * file into public/assets/sprites swaps the look without code changes.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;
  private spriteRes = 0;
  private readonly creatures = new Map<string, SheetSprite>();
  private gems!: SheetSprite[];
  private gold!: Sprite;
  private heal!: Sprite;
  private vacuum!: Sprite;
  private chest!: Sprite;
  private player!: SheetSprite;
  private wandBolt!: SheetSprite;
  private dagger!: SheetSprite;
  private orb!: SheetSprite;
  private enemyBullet!: SheetSprite;
  private readonly booms = new Map<string, SheetSprite>();
  private shadow!: SheetSprite;
  private halo!: Sprite;
  private vignette: HTMLCanvasElement | null = null;
  private smoothing = true;
  private visible = new Int32Array(4096);

  constructor(private readonly canvas: HTMLCanvasElement, private readonly assets: AssetLoader) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    assets.onChange(() => this.creatures.clear());
  }

  /** (Re)builds every cached procedural sprite at `res` device pixels per world unit. */
  private buildSprites(res: number): void {
    if (Math.abs(res - this.spriteRes) < 0.01) return;
    this.spriteRes = res;
    setSpriteResolution(res);
    this.creatures.clear();
    this.gems = [
      gemSprite(5, '#5ef2ff'), gemSprite(7, '#4dff9d'), gemSprite(9, '#ff4d6d'), gemSprite(12, '#ffe14d'),
    ].map((g) => sheetOf(g, 'none'));
    this.gold = iconSprite(7, '#ffd166', '¤');
    this.heal = iconSprite(10, '#4dff9d', '✚');
    this.vacuum = iconSprite(11, '#5ef2ff', '◎');
    this.chest = iconSprite(15, '#ffe14d', '★');
    this.player = playerSheet(15, res);
    this.wandBolt = sheetOf(boltSprite(16, 7, WEAPONS.wand.color), 'face');
    this.dagger = sheetOf(daggerSprite(13, WEAPONS.daggers.color), 'spin');
    this.orb = sheetOf(glowDot(12, WEAPONS.orbs.color), 'none');
    this.enemyBullet = sheetOf(glowDot(7, '#ff5d5d', '#ffd0d0'), 'none');
    this.booms.clear();
    this.shadow = shadowSprite(res);
    this.halo = glowDot(10, '#000000', 'rgba(0,0,0,0)');
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.vignette = null;
    this.smoothing = true;
    this.buildSprites(this.zoomFor() * this.dpr);
  }

  /** World units visible per CSS pixel is 1 / zoom; keeps a similar field of view on every screen. */
  zoomFor(): number {
    const z = Math.sqrt(this.width * this.height) / 900;
    return Math.max(0.6, Math.min(1.5, z));
  }

  /** A user PNG if one was loaded for `key`, otherwise the procedural fallback. */
  private pick(key: SpriteKey, fallback: SheetSprite): SheetSprite {
    return this.assets.get(key) ?? fallback;
  }

  private enemySheet(kind: EnemyKind, radius: number): SheetSprite {
    const loaded = this.assets.get(`enemies/${kind}` as SpriteKey);
    if (loaded) return loaded;
    const key = `${kind}:${Math.round(radius)}`;
    let s = this.creatures.get(key);
    if (!s) {
      s = creatureSheet(kind, radius, ENEMIES[kind].color, this.spriteRes);
      this.creatures.set(key, s);
    }
    return s;
  }

  private setSmoothing(on: boolean): void {
    if (this.smoothing === on) return;
    this.smoothing = on;
    this.ctx.imageSmoothingEnabled = on;
  }

  /**
   * Draws frame `frame` of a sheet centred on world (x, y). `size` is the
   * world size of the frame's longest side for loaded PNGs; procedural
   * sheets use their own baked size multiplied by `procScale`.
   */
  private drawSheet(
    sp: SheetSprite, frame: number, x: number, y: number, size: number, procScale: number,
    heading: number, spin: number, flash: boolean, s: number, camL: number, camT: number,
  ): void {
    const fw = sp.frameW;
    const fh = sp.frameH;
    const world = sp.worldSize !== undefined ? sp.worldSize * procScale : size * sp.scale;
    const k = (world / Math.max(fw, fh)) * s;
    let rot = 0;
    let fx = 1;
    switch (sp.rotation) {
      case 'face': rot = heading - sp.angle; break;
      case 'flip': fx = Math.cos(heading) < 0 ? -1 : 1; break;
      case 'spin': rot = spin; break;
      default: break;
    }
    const c = Math.cos(rot) * k;
    const sn = Math.sin(rot) * k;
    this.ctx.setTransform(c * fx, sn * fx, -sn, c, (x - camL) * s, (y - camT) * s);
    this.setSmoothing(!sp.pixelated);
    const f = frame % sp.frames;
    const sx = (f % sp.cols) * fw;
    const sy = Math.floor(f / sp.cols) * fh;
    if (flash && sp.worldSize === undefined) {
      // User art: keep the sprite readable and wash it with a white overlay.
      this.ctx.drawImage(sp.image, sx, sy, fw, fh, -fw / 2, -fh / 2, fw, fh);
      const a = this.ctx.globalAlpha;
      this.ctx.globalAlpha = a * 0.7;
      this.ctx.drawImage(sp.flash, sx, sy, fw, fh, -fw / 2, -fh / 2, fw, fh);
      this.ctx.globalAlpha = a;
      return;
    }
    this.ctx.drawImage(flash ? sp.flash : sp.image, sx, sy, fw, fh, -fw / 2, -fh / 2, fw, fh);
  }

  // ------------------------------------------------------------------ frame

  render(world: World | null, cam: Camera, alpha: number, time: number, debug: string | null): void {
    const ctx = this.ctx;
    const s = cam.zoom * this.dpr;
    const camL = cam.left + cam.shakeX;
    const camT = cam.top + cam.shakeY;
    const base = () => ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    base();
    this.drawGrid(cam, camL, camT, time, !world);

    if (world) {
      this.drawAuras(world);
      this.drawPickups(world, cam, time, s, camL, camT);
      const n = this.collectVisibleEnemies(world, cam, alpha);
      base();
      this.drawShadows(world, n, alpha);
      this.drawEnemies(world, n, alpha, s, camL, camT, time);
      base();
      this.drawBossBars(world, n);
      this.drawPlayer(world, alpha, s, camL, camT, time);
      base();
      ctx.globalCompositeOperation = 'lighter';
      this.drawOrbs(world, s, camL, camT, time);
      this.drawProjectiles(world, cam, alpha, s, camL, camT, time);
      base();
      this.drawEnemyBullets(world, cam, alpha, s, camL, camT, time);
      base();
      this.drawParticles(world, cam);
      this.drawEffects(world, s, camL, camT);
      base();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      this.drawFloaters(world, cam);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawBossPointers(world, cam, camL, camT);
    } else {
      this.drawAttract(cam, s, camL, camT, time);
    }
    this.setSmoothing(true);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.drawVignette();
    if (world && world.hurtFlash > 0) {
      ctx.globalAlpha = world.hurtFlash * 0.3;
      ctx.fillStyle = '#ff1f4b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    if (world && world.player.hp > 0 && world.player.hp / world.stats.maxHp < 0.3) {
      // Low-HP heartbeat pulse.
      ctx.globalAlpha = (0.5 + 0.5 * Math.sin(time * 6)) * 0.16;
      ctx.fillStyle = '#ff1f4b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    if (debug) this.drawDebug(debug);
  }

  private drawDebug(text: string): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = `600 12px ${DAMAGE_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const lines = text.split('\n');
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(8, this.height - 14 - lines.length * 15, 270, lines.length * 15 + 8);
    ctx.fillStyle = '#9dff9d';
    lines.forEach((l, i) => ctx.fillText(l, 14, this.height - 8 - (lines.length - 1 - i) * 15 - 4));
  }

  private drawGrid(cam: Camera, camL: number, camT: number, time: number, attract: boolean): void {
    const ctx = this.ctx;
    const w = cam.viewW;
    const h = cam.viewH;
    const ox = attract ? (time * 20) % GRID : 0;
    const oy = attract ? (time * 12) % GRID : 0;
    const xs = attract ? camL : Math.max(0, camL);
    const xe = attract ? camL + w : Math.min(ARENA_W, camL + w);
    const ys = attract ? camT : Math.max(0, camT);
    const ye = attract ? camT + h : Math.min(ARENA_H, camT + h);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(110, 85, 240, 0.09)';
    ctx.beginPath();
    for (let x = Math.ceil((xs - ox) / GRID) * GRID + ox; x <= xe; x += GRID) {
      ctx.moveTo(x, ys);
      ctx.lineTo(x, ye);
    }
    for (let y = Math.ceil((ys - oy) / GRID) * GRID + oy; y <= ye; y += GRID) {
      ctx.moveTo(xs, y);
      ctx.lineTo(xe, y);
    }
    ctx.stroke();
    // Brighter dots on grid intersections read as a floor, not graph paper.
    ctx.fillStyle = 'rgba(140, 110, 255, 0.28)';
    for (let x = Math.ceil((xs - ox) / GRID) * GRID + ox; x <= xe; x += GRID) {
      for (let y = Math.ceil((ys - oy) / GRID) * GRID + oy; y <= ye; y += GRID) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    if (!attract) {
      ctx.fillStyle = 'rgba(255, 60, 170, 0.06)';
      ctx.fillRect(-600, -600, ARENA_W + 1200, 600);
      ctx.fillRect(-600, ARENA_H, ARENA_W + 1200, 600);
      ctx.fillRect(-600, 0, 600, ARENA_H);
      ctx.fillRect(ARENA_W, 0, 600, ARENA_H);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 60, 170, 0.85)';
      ctx.shadowColor = '#ff3caa';
      ctx.shadowBlur = 20;
      ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
      ctx.shadowBlur = 0;
    }
  }

  /** Menu backdrop: a few creatures drifting across the grid. */
  private drawAttract(cam: Camera, s: number, camL: number, camT: number, time: number): void {
    const w = cam.viewW + 200;
    for (let i = 0; i < ATTRACT_KINDS.length; i++) {
      const kind = ATTRACT_KINDS[i];
      const def = ENEMIES[kind];
      const speed = def.speed * 0.35;
      const lane = ((i * 0.37) % 1) * cam.viewH - cam.viewH / 2;
      const dir = i % 2 === 0 ? 1 : -1;
      const t = (time * speed + i * 397) % w;
      const x = dir > 0 ? camL - 100 + t : camL + cam.viewW + 100 - t;
      const y = cam.y + lane + Math.sin(time * 1.3 + i) * 30;
      const heading = (dir > 0 ? 0 : Math.PI) + Math.cos(time * 1.3 + i) * 0.25;
      this.ctx.globalAlpha = 0.55;
      const sp = this.enemySheet(kind, def.radius);
      this.drawSheet(sp, frameAt(sp, time, i), x, y, def.radius * 2.7, 1, heading, 0, false, s, camL, camT);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawAuras(world: World): void {
    const ctx = this.ctx;
    const p = world.player;
    for (const w of world.weapons) {
      if (w.id !== 'aura') continue;
      const r = w.stats.area;
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
      const a = 0.06 + w.pulse * 0.12;
      g.addColorStop(0, hexA('#4dff9d', 0));
      g.addColorStop(0.8, hexA('#4dff9d', a));
      g.addColorStop(1, hexA('#4dff9d', a * 2));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = hexA('#4dff9d', 0.3 + w.pulse * 0.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (0.96 + w.pulse * 0.04), 0, TAU);
      ctx.stroke();
    }
  }

  private drawPickups(world: World, cam: Camera, time: number, s: number, camL: number, camT: number): void {
    const ctx = this.ctx;
    const items = world.pickups.items;
    const gemArt = this.assets.get('effects/gem');
    const gemSizes = [10, 13, 16, 21];
    for (let i = 0; i < world.pickups.count; i++) {
      const pk = items[i];
      if (!cam.sees(pk.x, pk.y, 30)) continue;
      const bob = pk.magnet ? 0 : Math.sin(time * 4 + pk.phase) * 2;
      if (pk.kind === 'xp') {
        const tier = gemTier(pk.value);
        const sp = gemArt ?? this.gems[tier];
        this.drawSheet(sp, frameAt(sp, time, pk.phase), pk.x, pk.y + bob, gemSizes[tier], 1, 0, 0, false, s, camL, camT);
        continue;
      }
      ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
      this.setSmoothing(true);
      let spr: Sprite;
      switch (pk.kind) {
        case 'gold': spr = this.gold; break;
        case 'heal': spr = this.heal; break;
        case 'vacuum': spr = this.vacuum; break;
        default: spr = this.chest;
      }
      const scale = pk.kind === 'chest' ? 1 + Math.sin(time * 6) * 0.08 : 1;
      const h = spr.half * scale;
      ctx.drawImage(spr.canvas, pk.x - h, pk.y - h + bob, h * 2, h * 2);
    }
  }

  /** Culls once per frame; the shadow, body and bar passes reuse the list. */
  private collectVisibleEnemies(world: World, cam: Camera, alpha: number): number {
    const items = world.enemies.items;
    if (this.visible.length < world.enemies.capacity) this.visible = new Int32Array(world.enemies.capacity);
    let n = 0;
    for (let i = 0; i < world.enemies.count; i++) {
      const e = items[i];
      if (!e.active) continue;
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      if (cam.sees(x, y, e.radius * 1.6 + 10)) this.visible[n++] = i;
    }
    return n;
  }

  /** Soft drop shadows ground the swarm and separate overlapping bodies. */
  private drawShadows(world: World, n: number, alpha: number): void {
    const ctx = this.ctx;
    const items = world.enemies.items;
    const img = this.shadow.image;
    this.setSmoothing(true);
    for (let k = 0; k < n; k++) {
      const e = items[this.visible[k]];
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const w = e.radius * 2.3;
      const h = e.radius * 1.1;
      ctx.drawImage(img, x - w / 2, y + e.radius * 0.45 - h / 2, w, h);
    }
  }

  private drawEnemies(world: World, n: number, alpha: number, s: number, camL: number, camT: number, time: number): void {
    const items = world.enemies.items;
    for (let k = 0; k < n; k++) {
      const e = items[this.visible[k]];
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const sp = this.enemySheet(e.def.kind, e.radius);
      // Squash-and-stretch pulse keeps the swarm lively.
      const pulse = 1 + Math.sin(time * 8 + e.wobble) * 0.04;
      this.drawSheet(
        sp, frameAt(sp, time, e.wobble * 3), x, y, e.radius * 2.7 * pulse, pulse,
        e.angle, 0, e.flash > 0, s, camL, camT,
      );
    }
  }

  /** In-world health bars, only for elites and bosses (tanks stay clean). */
  private drawBossBars(world: World, n: number): void {
    const ctx = this.ctx;
    const items = world.enemies.items;
    for (let k = 0; k < n; k++) {
      const e = items[this.visible[k]];
      const kind = e.def.kind;
      if ((kind !== 'elite' && kind !== 'boss') || e.hp >= e.maxHp) continue;
      const w = e.radius * 2;
      const bx = e.x - w / 2;
      const by = e.y - e.radius * 1.45 - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(bx - 2, by - 2, w + 4, 8);
      ctx.fillStyle = e.def.color;
      ctx.fillRect(bx, by, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  private drawPlayer(world: World, alpha: number, s: number, camL: number, camT: number, time: number): void {
    const ctx = this.ctx;
    const p = world.player;
    if (p.hp <= 0) return;
    const x = p.px + (p.x - p.px) * alpha;
    const y = p.py + (p.y - p.py) * alpha;
    // Dark halo carves the player out of the swarm, then a bright ring marks it.
    const hh = 46;
    this.setSmoothing(true);
    ctx.globalAlpha = 0.75;
    ctx.drawImage(this.halo.canvas, x - hh, y - hh, hh * 2, hh * 2);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(94, 242, 255, ${0.45 + Math.sin(time * 5) * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, TAU);
    ctx.stroke();
    // Magnet radius hint.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(94, 242, 255, 0.06)';
    ctx.beginPath();
    ctx.arc(x, y, world.stats.magnet, 0, TAU);
    ctx.stroke();
    // Mini HP bar under the ship once damaged (Vampire Survivors style).
    const frac = p.hp / world.stats.maxHp;
    if (frac < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(x - 17, y + 30, 34, 6);
      ctx.fillStyle = frac < 0.3 ? '#ff2d55' : '#ff5470';
      ctx.fillRect(x - 16, y + 31, 32 * Math.max(0, frac), 4);
    }
    const blink = p.invuln > 0 && Math.floor(time * 20) % 2 === 0;
    // Engine flame.
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 30) {
      const len = 8 + (speed / 250) * 12 + Math.sin(time * 40) * 3;
      const c = Math.cos(p.facing);
      const sn = Math.sin(p.facing);
      ctx.setTransform(c * s, sn * s, -sn * s, c * s, (x - camL) * s, (y - camT) * s);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 120, 220, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-9, -4);
      ctx.lineTo(-9 - len, 0);
      ctx.lineTo(-9, 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    const sp = this.pick('player/player', this.player);
    this.drawSheet(sp, frameAt(sp, time), x, y, p.radius * 3.2, 1, p.facing, 0, blink, s, camL, camT);
  }

  private drawOrbs(world: World, s: number, camL: number, camT: number, time: number): void {
    const sp = this.pick('weapons/orb', this.orb);
    for (const w of world.weapons) {
      if (w.id !== 'orbs') continue;
      const n = Math.min(16, w.stats.amount);
      for (let i = 0; i < n; i++) {
        this.drawSheet(sp, frameAt(sp, time, i), w.orbX[i], w.orbY[i], w.orbR * 2.6, w.orbR / 12, 0, time * 6, false, s, camL, camT);
      }
    }
  }

  private drawProjectiles(world: World, cam: Camera, alpha: number, s: number, camL: number, camT: number, time: number): void {
    const items = world.projectiles.items;
    const bolt = this.pick('weapons/wand', this.wandBolt);
    const dagger = this.pick('weapons/dagger', this.dagger);
    for (let i = 0; i < world.projectiles.count; i++) {
      const pr = items[i];
      const x = pr.px + (pr.x - pr.px) * alpha;
      const y = pr.py + (pr.y - pr.py) * alpha;
      if (!cam.sees(x, y, 30)) continue;
      const isDagger = pr.weapon === 'daggers';
      const sp = isDagger ? dagger : bolt;
      const heading = Math.atan2(pr.vy, pr.vx);
      const procScale = pr.radius / (isDagger ? 7 : 6);
      this.drawSheet(sp, frameAt(sp, time, i), x, y, pr.radius * (isDagger ? 4 : 5), procScale, heading, pr.spin, false, s, camL, camT);
    }
  }

  private drawEnemyBullets(world: World, cam: Camera, alpha: number, s: number, camL: number, camT: number, time: number): void {
    const items = world.enemyBullets.items;
    const sp = this.pick('weapons/enemy-bullet', this.enemyBullet);
    for (let i = 0; i < world.enemyBullets.count; i++) {
      const b = items[i];
      const x = b.px + (b.x - b.px) * alpha;
      const y = b.py + (b.y - b.py) * alpha;
      if (!cam.sees(x, y, 20)) continue;
      this.drawSheet(sp, frameAt(sp, time, i), x, y, b.radius * 2.8, 1, Math.atan2(b.vy, b.vx), time * 8, false, s, camL, camT);
    }
  }

  /** Particles are batched by palette color: one fillStyle per color. */
  private drawParticles(world: World, cam: Camera): void {
    const ctx = this.ctx;
    const items = world.particles.items;
    const n = world.particles.count;
    const l = cam.left - 10;
    const r = cam.left + cam.viewW + 10;
    const t = cam.top - 10;
    const b = cam.top + cam.viewH + 10;
    for (let c = 0; c < PALETTE.length; c++) {
      ctx.fillStyle = PALETTE[c];
      for (let i = 0; i < n; i++) {
        const pt = items[i];
        if (pt.color !== c || pt.x < l || pt.x > r || pt.y < t || pt.y > b) continue;
        const k = pt.life / pt.maxLife;
        ctx.globalAlpha = k;
        const sz = pt.size * (0.4 + 0.6 * k);
        ctx.fillRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawEffects(world: World, s: number, camL: number, camT: number): void {
    const ctx = this.ctx;
    const items = world.effects.items;
    const explosion = this.assets.get('effects/explosion');
    for (let i = 0; i < world.effects.count; i++) {
      const e = items[i];
      const k = e.life / e.maxLife;
      if (e.kind === 'boom') {
        if (explosion) {
          const frame = Math.min(explosion.frames - 1, Math.floor((1 - k) * explosion.frames));
          ctx.globalAlpha = 1;
          this.drawSheet(explosion, frame, e.x, e.y, e.r1 * 2, 1, 0, 0, false, s, camL, camT);
        } else {
          // Soft flash tinted with the enemy's colour (additive, so keep it faint).
          let boom = this.booms.get(e.color);
          if (!boom) {
            boom = sheetOf(glowDot(10, e.color, hexA(e.color, 0.35)), 'none');
            this.booms.set(e.color, boom);
          }
          const r = e.r0 + (e.r1 - e.r0) * (1 - k * k);
          ctx.globalAlpha = k * 0.45;
          this.drawSheet(boom, 0, e.x, e.y, 0, (r * 2) / (boom.worldSize ?? 1), 0, 0, false, s, camL, camT);
        }
        ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
        continue;
      }
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.strokeStyle = e.color;
      if (e.kind === 'ring') {
        const r = e.r1 + (e.r0 - e.r1) * k * k;
        ctx.lineWidth = e.width * k + 0.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.stroke();
      } else if (e.kind === 'bolt') {
        ctx.lineJoin = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass === 0 ? e.width * 3 : e.width;
          ctx.strokeStyle = pass === 0 ? hexA('#fff36b', 0.3) : '#ffffff';
          ctx.beginPath();
          for (let j = 0; j < e.npts; j++) {
            const x = e.pts[j * 2];
            const y = e.pts[j * 2 + 1];
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = e.width;
        ctx.beginPath();
        const mx = (e.x + e.x2) / 2 + (Math.random() - 0.5) * 20;
        const my = (e.y + e.y2) / 2 + (Math.random() - 0.5) * 20;
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(mx, my);
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(world: World, cam: Camera): void {
    const ctx = this.ctx;
    const items = world.floaters.items;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,5,13,0.9)';
    let lastSize = -1;
    for (let i = 0; i < world.floaters.count; i++) {
      const f = items[i];
      if (!cam.sees(f.x, f.y, 40)) continue;
      const k = f.life / f.maxLife;
      const size = Math.round(f.size * (1 + f.pop * 0.35));
      if (size !== lastSize) {
        ctx.font = `700 ${size}px ${DAMAGE_FONT}`;
        ctx.lineWidth = Math.max(3, size * 0.22);
        lastSize = size;
      }
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  /** Edge-of-screen arrows pointing at off-screen bosses. */
  private drawBossPointers(world: World, cam: Camera, camL: number, camT: number): void {
    const ctx = this.ctx;
    for (const e of world.bosses) {
      if (!e.active || cam.sees(e.x, e.y, -e.radius)) continue;
      const sx = (e.x - camL) * cam.zoom;
      const sy = (e.y - camT) * cam.zoom;
      const cx = this.width / 2;
      const cy = this.height / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const m = 40;
      const kx = (cx - m) / Math.abs(Math.cos(a) || 1e-6);
      const ky = (cy - m) / Math.abs(Math.sin(a) || 1e-6);
      const d = Math.min(kx, ky);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = e.def.color;
      ctx.strokeStyle = '#06050d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-9, -12);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 12);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawVignette(): void {
    const ctx = this.ctx;
    if (!this.vignette) {
      const c = document.createElement('canvas');
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const vctx = c.getContext('2d')!;
      const w = c.width;
      const h = c.height;
      const g = vctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.7)');
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, w, h);
      this.vignette = c;
    }
    ctx.drawImage(this.vignette, 0, 0);
  }
}
