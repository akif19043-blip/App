/** Small, allocation-free math helpers shared by the whole game. */

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** True when two circles overlap (touching counts as overlapping). */
export function circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

/** True when a point lies inside (or on) a circle. */
export function pointInCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  return dist2(px, py, cx, cy) <= r * r;
}

/** True when a circle intersects an axis-aligned rectangle. */
export function circleRectOverlap(
  cx: number, cy: number, r: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, nx, ny) <= r * r;
}

/**
 * Pushes two overlapping circles apart. Returns the penetration depth
 * (0 when they do not overlap) and writes the unit normal from A to B into `out`.
 */
export function circleSeparation(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
  out: { x: number; y: number },
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return 0;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    out.x = 1;
    out.y = 0;
    return r;
  }
  out.x = dx / d;
  out.y = dy / d;
  return r - d;
}

/** Normalises (x, y) into `out`; zero vectors stay zero. Returns the original length. */
export function normalize(x: number, y: number, out: { x: number; y: number }): number {
  const len = Math.sqrt(x * x + y * y);
  if (len < 1e-9) {
    out.x = 0;
    out.y = 0;
    return 0;
  }
  out.x = x / len;
  out.y = y / len;
  return len;
}

/** Exponential smoothing factor that is frame-rate independent. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}
