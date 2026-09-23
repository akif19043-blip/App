import { type Camera } from '../engine/camera';
import { TAU } from '../engine/math';
import { PALETTE } from '../entities/fx';
import { gemTier } from '../entities/pickup';
import { ENEMIES, type EnemyKind } from '../game/enemies';
import { ARENA_H, ARENA_W, type World } from '../game/world';
import { WEAPONS } from '../weapons/defs';
import {
  type Sprite, boltSprite, daggerSprite, enemySprite, gemSprite, glowDot, hexA, iconSprite, playerSprite,
  setSpriteResolution,
} from './sprites';

const BG = '#07060f';
const GRID = 80;

interface EnemySprites {
  normal: Sprite;
  flash: Sprite;
}

/** Canvas 2D renderer. Reads the world, never mutates it. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;
  private readonly enemySprites = new Map<string, EnemySprites>();
  private gems!: Sprite[];
  private gold!: Sprite;
  private heal!: Sprite;
  private vacuum!: Sprite;
  private chest!: Sprite;
  private player!: Sprite;
  private wandBolt!: Sprite;
  private dagger!: Sprite;
  private orb!: Sprite;
  private enemyBullet!: Sprite;
  private spriteRes = 0;
  private vignette: HTMLCanvasElement | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  /** (Re)builds every cached sprite at `res` device pixels per world unit. */
  private buildSprites(res: number): void {
    if (Math.abs(res - this.spriteRes) < 0.01) return;
    this.spriteRes = res;
    setSpriteResolution(res);
    this.enemySprites.clear();
    this.gems = [gemSprite(5, '#5ef2ff'), gemSprite(7, '#4dff9d'), gemSprite(9, '#ff4d6d'), gemSprite(12, '#ffe14d')];
    this.gold = iconSprite(7, '#ffd166', '¤');
    this.heal = iconSprite(10, '#4dff9d', '✚');
    this.vacuum = iconSprite(11, '#5ef2ff', '◎');
    this.chest = iconSprite(15, '#ffe14d', '★');
    this.player = playerSprite(15);
    this.wandBolt = boltSprite(16, 7, WEAPONS.wand.color);
    this.dagger = daggerSprite(13, WEAPONS.daggers.color);
    this.orb = glowDot(12, WEAPONS.orbs.color);
    this.enemyBullet = glowDot(7, '#ff5d5d', '#ffd0d0');
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
    this.buildSprites(this.zoomFor() * this.dpr);
  }

  /** World units visible per CSS pixel is 1 / zoom; keeps a similar field of view on every screen. */
  zoomFor(): number {
    const z = Math.sqrt(this.width * this.height) / 900;
    return Math.max(0.6, Math.min(1.5, z));
  }

  private spritesFor(kind: EnemyKind, radius: number): EnemySprites {
    const key = `${kind}:${Math.round(radius)}`;
    let s = this.enemySprites.get(key);
    if (!s) {
      const d = ENEMIES[kind];
      s = { normal: enemySprite(d.shape, radius, d.color, false), flash: enemySprite(d.shape, radius, d.color, true) };
      this.enemySprites.set(key, s);
    }
    return s;
  }

  // ------------------------------------------------------------------ frame

  render(world: World | null, cam: Camera, alpha: number, time: number, debug: string | null): void {
    const ctx = this.ctx;
    const s = cam.zoom * this.dpr;
    const camL = cam.left + cam.shakeX;
    const camT = cam.top + cam.shakeY;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
    this.drawGrid(cam, camL, camT, time, !world);

    if (world) {
      this.drawAuras(world);
      this.drawPickups(world, cam, time);
      this.drawEnemies(world, cam, alpha, s, camL, camT);
      ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
      this.drawPlayer(world, alpha, s, camL, camT, time);
      ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
      ctx.globalCompositeOperation = 'lighter';
      this.drawOrbs(world);
      this.drawProjectiles(world, cam, alpha, s, camL, camT);
      ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
      this.drawEnemyBullets(world, cam, alpha);
      this.drawParticles(world, cam);
      this.drawEffects(world);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      this.drawFloaters(world, cam);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawBossPointers(world, cam, camL, camT);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.drawVignette();
    if (world && world.hurtFlash > 0) {
      ctx.globalAlpha = world.hurtFlash * 0.35;
      ctx.fillStyle = '#ff1f4b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    if (world && world.player.hp > 0 && world.player.hp / world.stats.maxHp < 0.3) {
      // Low-HP heartbeat pulse.
      ctx.globalAlpha = (0.5 + 0.5 * Math.sin(time * 6)) * 0.18;
      ctx.fillStyle = '#ff1f4b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    if (debug) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const lines = debug.split('\n');
      ctx.fillRect(8, this.height - 14 - lines.length * 15, 250, lines.length * 15 + 8);
      ctx.fillStyle = '#9dff9d';
      lines.forEach((l, i) => ctx.fillText(l, 14, this.height - 8 - (lines.length - 1 - i) * 15 - 4));
    }
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
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(120, 90, 255, 0.13)';
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
    if (!attract) {
      // Glowing arena wall.
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 60, 170, 0.8)';
      ctx.shadowColor = '#ff3caa';
      ctx.shadowBlur = 20;
      ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
      ctx.shadowBlur = 0;
      // Hazard stripes just outside the wall.
      ctx.fillStyle = 'rgba(255, 60, 170, 0.05)';
      ctx.fillRect(-400, -400, ARENA_W + 800, 400);
      ctx.fillRect(-400, ARENA_H, ARENA_W + 800, 400);
      ctx.fillRect(-400, 0, 400, ARENA_H);
      ctx.fillRect(ARENA_W, 0, 400, ARENA_H);
    }
  }

  private drawAuras(world: World): void {
    const ctx = this.ctx;
    const p = world.player;
    for (const w of world.weapons) {
      if (w.id !== 'aura') continue;
      const r = w.stats.area;
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
      const a = 0.08 + w.pulse * 0.14;
      g.addColorStop(0, hexA('#4dff9d', 0));
      g.addColorStop(0.8, hexA('#4dff9d', a));
      g.addColorStop(1, hexA('#4dff9d', a * 2));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = hexA('#4dff9d', 0.35 + w.pulse * 0.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (0.96 + w.pulse * 0.04), 0, TAU);
      ctx.stroke();
    }
  }

  private drawPickups(world: World, cam: Camera, time: number): void {
    const ctx = this.ctx;
    const items = world.pickups.items;
    for (let i = 0; i < world.pickups.count; i++) {
      const pk = items[i];
      if (!cam.sees(pk.x, pk.y, 30)) continue;
      let spr: Sprite;
      switch (pk.kind) {
        case 'xp': spr = this.gems[gemTier(pk.value)]; break;
        case 'gold': spr = this.gold; break;
        case 'heal': spr = this.heal; break;
        case 'vacuum': spr = this.vacuum; break;
        default: spr = this.chest;
      }
      const bob = pk.magnet ? 0 : Math.sin(time * 4 + pk.phase) * 2;
      const scale = pk.kind === 'chest' ? 1 + Math.sin(time * 6) * 0.08 : 1;
      const h = spr.half * scale;
      ctx.drawImage(spr.canvas, pk.x - h, pk.y - h + bob, h * 2, h * 2);
    }
  }

  private drawEnemies(world: World, cam: Camera, alpha: number, s: number, camL: number, camT: number): void {
    const ctx = this.ctx;
    const items = world.enemies.items;
    const t = world.time;
    for (let i = 0; i < world.enemies.count; i++) {
      const e = items[i];
      if (!e.active) continue;
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      if (!cam.sees(x, y, e.radius + 20)) continue;
      const spr = this.spritesFor(e.def.kind, e.radius);
      const img = e.flash > 0 ? spr.flash : spr.normal;
      // Squash-and-stretch pulse keeps the swarm lively.
      const pulse = 1 + Math.sin(t * 8 + e.wobble) * 0.05;
      const c = Math.cos(e.angle) * s * pulse;
      const sn = Math.sin(e.angle) * s * pulse;
      ctx.setTransform(c, sn, -sn, c, (x - camL) * s, (y - camT) * s);
      ctx.drawImage(img.canvas, -img.half, -img.half, img.half * 2, img.half * 2);
    }
    // Health bars for tough enemies.
    ctx.setTransform(s, 0, 0, s, -camL * s, -camT * s);
    for (let i = 0; i < world.enemies.count; i++) {
      const e = items[i];
      const k = e.def.kind;
      if (!e.active || (k !== 'elite' && k !== 'boss' && k !== 'tank') || e.hp >= e.maxHp) continue;
      if (!cam.sees(e.x, e.y, e.radius + 20)) continue;
      const w = e.radius * 2;
      const bx = e.x - w / 2;
      const by = e.y - e.radius - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, w + 2, 6);
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
    // Magnet radius hint.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(94, 242, 255, 0.07)';
    ctx.beginPath();
    ctx.arc(x, y, world.stats.magnet, 0, TAU);
    ctx.stroke();
    if (p.invuln > 0 && Math.floor(time * 20) % 2 === 0) return;
    const spr = this.player;
    const c = Math.cos(p.facing) * s;
    const sn = Math.sin(p.facing) * s;
    ctx.setTransform(c, sn, -sn, c, (x - camL) * s, (y - camT) * s);
    ctx.drawImage(spr.canvas, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    // Engine flame.
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 30) {
      const len = 6 + (speed / 250) * 10 + Math.sin(time * 40) * 3;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 120, 220, 0.8)';
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(-5 - len, 0);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawOrbs(world: World): void {
    const ctx = this.ctx;
    for (const w of world.weapons) {
      if (w.id !== 'orbs') continue;
      const n = Math.min(16, w.stats.amount);
      const h = this.orb.half * (w.orbR / 12);
      for (let i = 0; i < n; i++) {
        ctx.drawImage(this.orb.canvas, w.orbX[i] - h, w.orbY[i] - h, h * 2, h * 2);
      }
    }
  }

  private drawProjectiles(world: World, cam: Camera, alpha: number, s: number, camL: number, camT: number): void {
    const ctx = this.ctx;
    const items = world.projectiles.items;
    for (let i = 0; i < world.projectiles.count; i++) {
      const pr = items[i];
      const x = pr.px + (pr.x - pr.px) * alpha;
      const y = pr.py + (pr.y - pr.py) * alpha;
      if (!cam.sees(x, y, 30)) continue;
      const spr = pr.weapon === 'daggers' ? this.dagger : this.wandBolt;
      const ang = pr.weapon === 'daggers' ? pr.spin : Math.atan2(pr.vy, pr.vx);
      const k = (pr.radius / (pr.weapon === 'daggers' ? 7 : 6)) * s;
      const c = Math.cos(ang) * k;
      const sn = Math.sin(ang) * k;
      ctx.setTransform(c, sn, -sn, c, (x - camL) * s, (y - camT) * s);
      ctx.drawImage(spr.canvas, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    }
  }

  private drawEnemyBullets(world: World, cam: Camera, alpha: number): void {
    const ctx = this.ctx;
    const items = world.enemyBullets.items;
    const spr = this.enemyBullet;
    for (let i = 0; i < world.enemyBullets.count; i++) {
      const b = items[i];
      const x = b.px + (b.x - b.px) * alpha;
      const y = b.py + (b.y - b.py) * alpha;
      if (!cam.sees(x, y, 20)) continue;
      ctx.drawImage(spr.canvas, x - spr.half, y - spr.half, spr.half * 2, spr.half * 2);
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

  private drawEffects(world: World): void {
    const ctx = this.ctx;
    const items = world.effects.items;
    for (let i = 0; i < world.effects.count; i++) {
      const e = items[i];
      const k = e.life / e.maxLife;
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
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    let lastSize = -1;
    for (let i = 0; i < world.floaters.count; i++) {
      const f = items[i];
      if (!cam.sees(f.x, f.y, 40)) continue;
      const k = f.life / f.maxLife;
      // Pop in, then fade.
      const pop = k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1;
      const size = Math.round(f.size * pop);
      if (size !== lastSize) {
        ctx.font = `800 ${size}px ui-monospace, Menlo, Consolas, monospace`;
        lastSize = size;
      }
      ctx.globalAlpha = Math.min(1, k * 2);
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
      const m = 34;
      const kx = (cx - m) / Math.abs(Math.cos(a) || 1e-6);
      const ky = (cy - m) / Math.abs(Math.sin(a) || 1e-6);
      const d = Math.min(kx, ky);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = e.def.color;
      ctx.shadowColor = e.def.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-8, -11);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-8, 11);
      ctx.closePath();
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
      g.addColorStop(1, 'rgba(0,0,0,0.65)');
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, w, h);
      this.vignette = c;
    }
    ctx.drawImage(this.vignette, 0, 0);
  }
}
