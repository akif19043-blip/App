import { describe, expect, it } from 'vitest';
import {
  circleRectOverlap, circleSeparation, circlesOverlap, clamp, dist, dist2, normalize, pointInCircle,
} from '../src/engine/math';

describe('collision math', () => {
  it('computes distances', () => {
    expect(dist2(0, 0, 3, 4)).toBe(25);
    expect(dist(0, 0, 3, 4)).toBe(5);
  });

  it('detects overlapping circles', () => {
    expect(circlesOverlap(0, 0, 5, 8, 0, 4)).toBe(true); // 8 < 9
    expect(circlesOverlap(0, 0, 5, 9, 0, 4)).toBe(true); // touching counts
    expect(circlesOverlap(0, 0, 5, 9.01, 0, 4)).toBe(false);
    expect(circlesOverlap(10, 10, 1, 10, 10, 1)).toBe(true); // concentric
  });

  it('is symmetric', () => {
    for (let i = 0; i < 100; i++) {
      const a = [Math.random() * 100, Math.random() * 100, Math.random() * 20] as const;
      const b = [Math.random() * 100, Math.random() * 100, Math.random() * 20] as const;
      expect(circlesOverlap(...a, ...b)).toBe(circlesOverlap(...b, ...a));
    }
  });

  it('tests points in circles', () => {
    expect(pointInCircle(3, 4, 0, 0, 5)).toBe(true);
    expect(pointInCircle(3, 4.1, 0, 0, 5)).toBe(false);
  });

  it('tests circles against rectangles', () => {
    expect(circleRectOverlap(5, 5, 1, 0, 0, 10, 10)).toBe(true); // inside
    expect(circleRectOverlap(-2, 5, 2, 0, 0, 10, 10)).toBe(true); // touching left edge
    expect(circleRectOverlap(-2.1, 5, 2, 0, 0, 10, 10)).toBe(false);
    // Corner: distance from (13, 13) to (10, 10) is ~4.24.
    expect(circleRectOverlap(13, 13, 4.3, 0, 0, 10, 10)).toBe(true);
    expect(circleRectOverlap(13, 13, 4.2, 0, 0, 10, 10)).toBe(false);
  });

  it('resolves circle penetration depth and normal', () => {
    const n = { x: 0, y: 0 };
    expect(circleSeparation(0, 0, 5, 8, 0, 5, n)).toBeCloseTo(2);
    expect(n).toEqual({ x: 1, y: 0 });
    expect(circleSeparation(0, 0, 5, 0, 20, 5, n)).toBe(0);
    // Coincident centres still get a usable normal.
    expect(circleSeparation(1, 1, 2, 1, 1, 2, n)).toBe(4);
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
  });

  it('normalises vectors and clamps', () => {
    const o = { x: 0, y: 0 };
    expect(normalize(3, 4, o)).toBe(5);
    expect(o.x).toBeCloseTo(0.6);
    expect(o.y).toBeCloseTo(0.8);
    expect(normalize(0, 0, o)).toBe(0);
    expect(o).toEqual({ x: 0, y: 0 });
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
