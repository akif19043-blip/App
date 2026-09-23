import { type EnemyShape } from '../game/enemies';

/**
 * Pre-rendered glow sprites. Drawing a cached bitmap with drawImage is far
 * cheaper than stroking paths with shadowBlur for thousands of entities.
 */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Half size in world units (the sprite is drawn centred). */
  half: number;
}

/**
 * Sprites are rasterised at this many device pixels per world unit. The
 * renderer sets it to zoom * devicePixelRatio so sprites blit ~1:1.
 */
let RES = 2;

export function setSpriteResolution(res: number): void {
  RES = Math.max(0.5, Math.min(4, res));
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * RES);
  const ctx = c.getContext('2d')!;
  ctx.scale(RES, RES);
  return [c, ctx];
}

export function shapePath(ctx: CanvasRenderingContext2D, shape: EnemyShape, r: number): void {
  ctx.beginPath();
  const poly = (n: number, rot: number, rr = r) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const star = (n: number, inner: number, rot: number) => {
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * inner;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  switch (shape) {
    case 'tri': poly(3, 0); break;
    case 'diamond': poly(4, 0); break;
    case 'hex': poly(6, Math.PI / 6); break;
    case 'square': poly(4, Math.PI / 4); break;
    case 'star': star(5, 0.5, -Math.PI / 2); break;
    case 'crown': star(8, 0.7, 0); break;
  }
}

/** Neon outline + translucent fill + inner core, with baked glow. */
export function enemySprite(shape: EnemyShape, r: number, color: string, flash: boolean): Sprite {
  const glow = Math.max(6, r * 0.6);
  const half = r + glow;
  const [c, ctx] = makeCanvas(half * 2);
  ctx.translate(half, half);
  const col = flash ? '#ffffff' : color;
  ctx.shadowColor = col;
  ctx.shadowBlur = glow;
  ctx.lineJoin = 'round';
  shapePath(ctx, shape, r);
  ctx.fillStyle = flash ? 'rgba(255,255,255,0.85)' : hexA(color, 0.28);
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Inner core / "eye".
  shapePath(ctx, shape, r * 0.38);
  ctx.fillStyle = flash ? '#ffffff' : hexA(color, 0.9);
  ctx.fill();
  return { canvas: c, half };
}

export function glowDot(r: number, color: string, core = '#ffffff'): Sprite {
  const glow = Math.max(6, r * 1.6);
  const half = r + glow;
  const [c, ctx] = makeCanvas(half * 2);
  ctx.translate(half, half);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, half);
  g.addColorStop(0, hexA(color, 0.9));
  g.addColorStop(r / half, hexA(color, 0.55));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, half, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  return { canvas: c, half };
}

/** XP gem: a small glowing crystal. */
export function gemSprite(r: number, color: string): Sprite {
  const glow = r * 1.4;
  const half = r + glow;
  const [c, ctx] = makeCanvas(half * 2);
  ctx.translate(half, half);
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.7, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.7, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.7);
  ctx.lineTo(r * 0.3, -r * 0.1);
  ctx.lineTo(0, r * 0.1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  return { canvas: c, half };
}

export function iconSprite(r: number, color: string, glyph: string): Sprite {
  const glow = r;
  const half = r + glow;
  const [c, ctx] = makeCanvas(half * 2);
  ctx.translate(half, half);
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = hexA(color, 0.25);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(r * 1.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, r * 0.08);
  return { canvas: c, half };
}

/** Elongated projectile pointing along +x. */
export function boltSprite(len: number, width: number, color: string): Sprite {
  const half = len + width * 2;
  const [c, ctx] = makeCanvas(half * 2);
  ctx.translate(half, half);
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 2;
  const g = ctx.createLinearGradient(-len, 0, len * 0.6, 0);
  g.addColorStop(0, hexA(color, 0));
  g.addColorStop(0.7, color);
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(len * 0.6, 0);
  ctx.lineTo(-len, -width * 0.5);
  ctx.lineTo(-len, width * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(len * 0.35, 0, width * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return { canvas: c, half };
}

export function daggerSprite(len: number, color: string): Sprite {
  const half = len + 6;
  const [c, ctx] = makeCanvas(half * 2);
  ctx.translate(half, half);
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#fff4e8';
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(0, -len * 0.28);
  ctx.lineTo(-len * 0.4, 0);
  ctx.lineTo(0, len * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  return { canvas: c, half };
}

export function playerSprite(r: number): Sprite {
  const glow = 14;
  const half = r + glow + 4;
  const [c, ctx] = makeCanvas(half * 2);
  ctx.translate(half, half);
  ctx.shadowColor = '#5ef2ff';
  ctx.shadowBlur = glow;
  // Arrow-ship pointing along +x.
  ctx.beginPath();
  ctx.moveTo(r * 1.25, 0);
  ctx.lineTo(-r * 0.8, -r * 0.9);
  ctx.lineTo(-r * 0.35, 0);
  ctx.lineTo(-r * 0.8, r * 0.9);
  ctx.closePath();
  ctx.fillStyle = 'rgba(94,242,255,0.3)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#5ef2ff';
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return { canvas: c, half };
}

/** '#rrggbb' + alpha -> 'rgba(...)'. */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
