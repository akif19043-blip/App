import { type Poolable } from '../engine/pool';

/**
 * Particles store a palette index instead of a color string so the renderer
 * can draw all particles of one color in a single fillStyle batch.
 */
export const PALETTE: string[] = [];
const paletteIndex = new Map<string, number>();

export function colorId(color: string): number {
  let id = paletteIndex.get(color);
  if (id === undefined) {
    id = PALETTE.length;
    PALETTE.push(color);
    paletteIndex.set(color, id);
  }
  return id;
}

export class Particle implements Poolable {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  maxLife = 1;
  size = 3;
  color = 0;
  drag = 3;
}

export class Floater implements Poolable {
  active = false;
  x = 0;
  y = 0;
  vy = 0;
  life = 0;
  maxLife = 0.8;
  text = '';
  color = '#fff';
  size = 14;
  /** Increments every time the object is reused, so stale references can be detected. */
  serial = 0;
  value = 0;
  crit = false;
  /** Scale punch in [0, 1], set when the number grows. */
  pop = 1;
}

export type EffectKind = 'bolt' | 'ring' | 'spark' | 'boom';

export class Effect implements Poolable {
  active = false;
  kind: EffectKind = 'ring';
  x = 0;
  y = 0;
  x2 = 0;
  y2 = 0;
  r0 = 0;
  r1 = 0;
  life = 0;
  maxLife = 0.3;
  color = '#fff';
  width = 3;
  /** Jagged bolt vertices (x, y pairs). */
  readonly pts = new Float32Array(24);
  npts = 0;
}
