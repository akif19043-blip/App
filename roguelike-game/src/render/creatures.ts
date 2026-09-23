import { type EnemyKind } from '../game/enemies';
import { type SheetSprite, makeSilhouette } from './assets';
import { type SpriteRotation } from './spriteMeta';

/**
 * Procedural fallback art: little neon creatures (bugs, jellies, beetles,
 * slugs...) drawn with canvas paths into 4-frame spritesheets. Every
 * creature faces +x and gets a dark "ink" outline so overlapping enemies
 * stay readable in a dense swarm.
 */

const TAU = Math.PI * 2;
const INK = '#05040c';
export const CREATURE_FRAMES = 4;

type DrawFn = (ctx: CanvasRenderingContext2D, r: number, phase: number, color: string) => void;

/** '#rrggbb' + alpha -> 'rgba(...)'. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mixes a hex colour towards black (t < 0) or white (t > 0). */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Renders `frames` animation frames side by side. `half` is the half-size
 * of a frame in world units, `res` the pixels per world unit.
 */
export function buildSheet(
  half: number, res: number, frames: number, rotation: SpriteRotation,
  draw: (ctx: CanvasRenderingContext2D, phase: number) => void,
  drawFlash?: (ctx: CanvasRenderingContext2D, phase: number) => void,
): SheetSprite {
  const fpx = Math.ceil(half * 2 * res);
  const render = (fn: (ctx: CanvasRenderingContext2D, phase: number) => void) => {
    const c = document.createElement('canvas');
    c.width = fpx * frames;
    c.height = fpx;
    const ctx = c.getContext('2d')!;
    for (let f = 0; f < frames; f++) {
      ctx.save();
      ctx.translate(f * fpx + fpx / 2, fpx / 2);
      ctx.scale(res, res);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      fn(ctx, f / frames);
      ctx.restore();
    }
    return c;
  };
  const c = render(draw);
  return {
    image: c,
    // A white-coloured redraw keeps the dark outline and eyes, so a crowd
    // flashing at once stays a crowd instead of merging into one white blob.
    flash: drawFlash ? render(drawFlash) : makeSilhouette(c, c.width, c.height),
    frameW: fpx,
    frameH: fpx,
    frames,
    cols: frames,
    fps: 8,
    scale: 1,
    rotation,
    angle: 0,
    pixelated: false,
    worldSize: half * 2,
  };
}

/** Strokes the current path twice: a thick dark ink line, then the neon line. */
function inkStroke(ctx: CanvasRenderingContext2D, color: string, w: number, glow = 0): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w * 2.2 + 1;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function bodyFill(ctx: CanvasRenderingContext2D, color: string, r: number): void {
  const g = ctx.createRadialGradient(r * 0.25, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, shade(color, -0.25));
  g.addColorStop(1, shade(color, -0.78));
  ctx.fillStyle = g;
  ctx.fill();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pupil: string, look = 0.35): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, TAU);
  ctx.fillStyle = '#fff8e0';
  ctx.shadowColor = pupil;
  ctx.shadowBlur = r * 1.5;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(x + r * look, y, r * 0.42, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
}

// ---------------------------------------------------------------- creatures

/** Swarmer: a skittering bug with six legs and mandibles. */
const swarmer: DrawFn = (ctx, r, phase, color) => {
  for (let i = -1; i <= 1; i++) {
    for (const side of [-1, 1]) {
      const swing = Math.sin(phase * TAU + i * 2.1 + (side > 0 ? Math.PI : 0)) * 0.45;
      const bx = i * r * 0.42;
      const a = side * (Math.PI / 2 + i * 0.35) + swing * side;
      ctx.beginPath();
      ctx.moveTo(bx, side * r * 0.3);
      ctx.lineTo(bx + Math.cos(a) * r * 0.55 - r * 0.15, side * r * 0.3 + Math.sin(a) * r * 0.75);
      inkStroke(ctx, color, r * 0.14);
    }
  }
  // Abdomen + head.
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, 0, r * 0.72, r * 0.5, 0, 0, TAU);
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.16, r * 0.5);
  ctx.beginPath();
  ctx.arc(r * 0.55, 0, r * 0.38, 0, TAU);
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.14);
  // Mandibles.
  const open = 0.25 + Math.abs(Math.sin(phase * TAU)) * 0.3;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.8, s * r * 0.18);
    ctx.quadraticCurveTo(r * 1.2, s * r * (0.2 + open), r * 1.12, s * r * 0.02);
    inkStroke(ctx, color, r * 0.11);
  }
  eye(ctx, r * 0.66, -r * 0.17, r * 0.14, color, 0.3);
  eye(ctx, r * 0.66, r * 0.17, r * 0.14, color, 0.3);
};

/** Drone: a floating cyclops jelly with trailing tentacles. */
const grunt: DrawFn = (ctx, r, phase, color) => {
  for (let i = 0; i < 4; i++) {
    const y0 = (i - 1.5) * r * 0.32;
    const wave = Math.sin(phase * TAU + i * 1.3) * r * 0.28;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, y0);
    ctx.bezierCurveTo(-r * 0.9, y0 + wave, -r * 1.05, y0 - wave, -r * 1.35, y0 + wave * 0.6);
    inkStroke(ctx, color, r * 0.12);
  }
  const pulse = 1 + Math.sin(phase * TAU) * 0.04;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78 * pulse, r * 0.7 / pulse, 0, 0, TAU);
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.13, r * 0.45);
  // Membrane ridges.
  ctx.beginPath();
  ctx.arc(-r * 0.1, 0, r * 0.52, Math.PI * 0.6, Math.PI * 1.4);
  ctx.strokeStyle = rgba(color, 0.55);
  ctx.lineWidth = r * 0.07;
  ctx.stroke();
  eye(ctx, r * 0.22, 0, r * 0.36, color, 0.4);
};

/** Bulwark: an armoured beetle with a plated shell and horns. */
const tank: DrawFn = (ctx, r, phase, color) => {
  for (let i = -1; i <= 1; i++) {
    for (const side of [-1, 1]) {
      const swing = Math.sin(phase * TAU + i * 1.7 + (side > 0 ? Math.PI : 0)) * 0.25;
      ctx.beginPath();
      ctx.moveTo(i * r * 0.4, side * r * 0.55);
      ctx.lineTo(i * r * 0.4 + swing * r * 0.5, side * r * 1.0);
      inkStroke(ctx, color, r * 0.13);
    }
  }
  // Head with horns.
  ctx.beginPath();
  ctx.arc(r * 0.72, 0, r * 0.3, 0, TAU);
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.08);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.9, s * r * 0.15);
    ctx.quadraticCurveTo(r * 1.2, s * r * 0.3, r * 1.18, s * r * 0.05);
    inkStroke(ctx, color, r * 0.08);
  }
  eye(ctx, r * 0.84, -r * 0.13, r * 0.09, color, 0.3);
  eye(ctx, r * 0.84, r * 0.13, r * 0.09, color, 0.3);
  // Shell.
  ctx.beginPath();
  ctx.ellipse(-r * 0.08, 0, r * 0.78, r * 0.7, 0, 0, TAU);
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.09, r * 0.3);
  ctx.strokeStyle = rgba(color, 0.8);
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(r * 0.68, 0);
  ctx.lineTo(-r * 0.84, 0);
  ctx.stroke();
  for (const k of [0.35, 0.65]) {
    ctx.beginPath();
    ctx.ellipse(-r * 0.08, 0, r * 0.78 * k, r * 0.7 * k, 0, Math.PI * 0.55, Math.PI * 1.45);
    ctx.stroke();
  }
  // Highlight.
  ctx.beginPath();
  ctx.ellipse(r * 0.1, -r * 0.35, r * 0.3, r * 0.1, -0.2, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();
};

/** Spitter: a wobbling slug with a gaping mouth and three eyes. */
const spitter: DrawFn = (ctx, r, phase, color) => {
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    const rr = r * (0.82 + Math.sin(a * 5 + phase * TAU) * 0.06 + (Math.cos(a) < 0 ? 0.08 : 0));
    const x = Math.cos(a) * rr * 1.05;
    const y = Math.sin(a) * rr * 0.85;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.12, r * 0.4);
  // Spots.
  ctx.fillStyle = rgba(color, 0.35);
  for (const [x, y, s] of [[-0.4, -0.35, 0.12], [-0.55, 0.25, 0.1], [-0.15, 0.45, 0.08]]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, s * r, 0, TAU);
    ctx.fill();
  }
  // Mouth opens and closes.
  const open = 0.08 + Math.abs(Math.sin(phase * TAU)) * 0.22;
  ctx.beginPath();
  ctx.ellipse(r * 0.62, 0, r * 0.2, r * open + r * 0.05, 0, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.07;
  ctx.stroke();
  eye(ctx, r * 0.18, -r * 0.4, r * 0.15, color, 0.3);
  eye(ctx, r * 0.3, 0, r * 0.13, color, 0.3);
  eye(ctx, r * 0.18, r * 0.4, r * 0.15, color, 0.3);
};

/** Elite: a spiked horned beast with angry eyes and fangs. */
const elite: DrawFn = (ctx, r, phase, color) => {
  const spikes = 9;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU;
    const out = i % 2 === 0;
    const rr = out ? r * (0.98 + Math.sin(phase * TAU + i) * 0.06) : r * 0.7;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.07, r * 0.35);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  ctx.strokeStyle = rgba(color, 0.4);
  ctx.lineWidth = r * 0.04;
  ctx.stroke();
  // Slanted angry eyes.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.1, s * r * 0.34);
    ctx.lineTo(r * 0.52, s * r * 0.12);
    ctx.lineTo(r * 0.42, s * r * 0.32);
    ctx.closePath();
    ctx.fillStyle = '#fff3b0';
    ctx.shadowColor = '#ff3355';
    ctx.shadowBlur = r * 0.3;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.04;
    ctx.stroke();
  }
  // Fanged mouth.
  ctx.beginPath();
  ctx.moveTo(r * 0.6, -r * 0.2);
  ctx.quadraticCurveTo(r * 0.78, 0, r * 0.6, r * 0.2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.08;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.64, s * r * 0.12);
    ctx.lineTo(r * 0.55, s * r * 0.05);
    ctx.lineTo(r * 0.68, s * r * 0.05);
    ctx.closePath();
    ctx.fill();
  }
};

/** Boss: a many-armed horror with a crown of tentacles, three eyes and teeth. */
const boss: DrawFn = (ctx, r, phase, color) => {
  const arms = 12;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU + Math.sin(phase * TAU + i) * 0.08;
    const len = r * (1.12 + Math.sin(phase * TAU * 1 + i * 1.7) * 0.07);
    const bend = Math.sin(phase * TAU + i * 0.9) * 0.35;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    ctx.quadraticCurveTo(
      Math.cos(a + bend) * r * 0.95, Math.sin(a + bend) * r * 0.95,
      Math.cos(a) * len, Math.sin(a) * len,
    );
    inkStroke(ctx, color, r * 0.09);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.74, 0, TAU);
  bodyFill(ctx, color, r);
  inkStroke(ctx, color, r * 0.06, r * 0.3);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, TAU);
  ctx.strokeStyle = rgba(color, 0.45);
  ctx.lineWidth = r * 0.03;
  ctx.setLineDash([r * 0.08, r * 0.06]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Maw.
  const open = 0.1 + Math.abs(Math.sin(phase * TAU)) * 0.12;
  ctx.beginPath();
  ctx.ellipse(r * 0.38, 0, r * 0.14, r * (0.16 + open), 0, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(r * 0.3, k * r * 0.07);
    ctx.lineTo(r * 0.42, k * r * 0.07 + r * 0.025);
    ctx.lineTo(r * 0.3, k * r * 0.07 + r * 0.05);
    ctx.fill();
  }
  eye(ctx, -r * 0.05, 0, r * 0.2, color, 0.45);
  eye(ctx, r * 0.05, -r * 0.36, r * 0.12, color, 0.4);
  eye(ctx, r * 0.05, r * 0.36, r * 0.12, color, 0.4);
};

const DRAW: Record<EnemyKind, DrawFn> = { swarmer, grunt, tank, spitter, elite, boss };

/** Fallback spritesheet for an enemy of `kind` with collision radius `r`. */
export function creatureSheet(kind: EnemyKind, r: number, color: string, res: number): SheetSprite {
  const half = r * 1.45;
  return buildSheet(
    half, res, CREATURE_FRAMES, 'face',
    (ctx, phase) => DRAW[kind](ctx, r, phase, color),
    (ctx, phase) => DRAW[kind](ctx, r, phase, '#ffffff'),
  );
}

/** The player's ship: a swept-wing fighter with a white outline so it pops. */
export function playerSheet(r: number, res: number): SheetSprite {
  return buildSheet(r * 1.9, res, 1, 'face', (ctx) => {
    const hull = () => {
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(r * 0.2, -r * 0.35);
      ctx.lineTo(-r * 0.55, -r * 1.05);
      ctx.lineTo(-r * 0.85, -r * 0.95);
      ctx.lineTo(-r * 0.45, -r * 0.2);
      ctx.lineTo(-r * 0.7, 0);
      ctx.lineTo(-r * 0.45, r * 0.2);
      ctx.lineTo(-r * 0.85, r * 0.95);
      ctx.lineTo(-r * 0.55, r * 1.05);
      ctx.lineTo(r * 0.2, r * 0.35);
      ctx.closePath();
    };
    // Outer glow + dark ink + white rim: readable on any background.
    hull();
    ctx.shadowColor = '#5ef2ff';
    ctx.shadowBlur = r * 0.9;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(-r, 0, r * 1.3, 0);
    g.addColorStop(0, '#0b3a52');
    g.addColorStop(1, '#1fb5d6');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Wing stripes and cockpit.
    ctx.strokeStyle = '#5ef2ff';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, s * r * 0.3);
      ctx.lineTo(-r * 0.55, s * r * 0.85);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(r * 0.35, 0, r * 0.35, r * 0.16, 0, 0, TAU);
    ctx.fillStyle = '#e8feff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

/** Soft elliptical drop shadow, drawn under every enemy. */
export function shadowSprite(res: number): SheetSprite {
  return buildSheet(1, res * 24, 1, 'none', (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
  });
}
