import { describe, expect, it } from 'vitest';
import { circlesOverlap } from '../src/engine/math';
import { Rng } from '../src/engine/rng';
import { SpatialGrid } from '../src/engine/spatialGrid';

describe('SpatialGrid', () => {
  it('returns every item near the query point', () => {
    const g = new SpatialGrid(1000, 1000, 50, 100);
    g.begin();
    g.add(0, 10, 10);
    g.add(1, 500, 500);
    g.add(2, 520, 510);
    g.add(3, 990, 990);
    g.end();
    const out = new Int32Array(16);
    const n = g.query(505, 505, 30, out);
    expect(Array.from(out.subarray(0, n)).sort()).toEqual([1, 2]);
    expect(g.query(0, 0, 5, out)).toBe(1);
    expect(out[0]).toBe(0);
  });

  it('clamps out-of-bounds positions into edge cells', () => {
    const g = new SpatialGrid(100, 100, 10, 10);
    g.begin();
    g.add(7, -50, 150);
    g.end();
    const out = new Int32Array(4);
    expect(g.query(0, 99, 1, out)).toBe(1);
    expect(out[0]).toBe(7);
  });

  it('finds exactly the brute-force collisions for thousands of random circles', () => {
    const rng = new Rng(42);
    const N = 3000;
    const W = 3000;
    const xs = new Float64Array(N);
    const ys = new Float64Array(N);
    const rs = new Float64Array(N);
    const MAX_R = 20;
    const g = new SpatialGrid(W, W, 64, N);
    g.begin();
    for (let i = 0; i < N; i++) {
      xs[i] = rng.range(0, W);
      ys[i] = rng.range(0, W);
      rs[i] = rng.range(4, MAX_R);
      g.add(i, xs[i], ys[i]);
    }
    g.end();
    expect(g.size).toBe(N);
    const out = new Int32Array(N);
    for (let q = 0; q < 200; q++) {
      const qx = rng.range(0, W);
      const qy = rng.range(0, W);
      const qr = rng.range(5, 60);
      const brute = new Set<number>();
      for (let i = 0; i < N; i++) if (circlesOverlap(qx, qy, qr, xs[i], ys[i], rs[i])) brute.add(i);
      const n = g.query(qx, qy, qr + MAX_R, out);
      const viaGrid = new Set<number>();
      for (let k = 0; k < n; k++) {
        const i = out[k];
        if (circlesOverlap(qx, qy, qr, xs[i], ys[i], rs[i])) viaGrid.add(i);
      }
      expect(viaGrid).toEqual(brute);
    }
  });

  it('is reusable across frames', () => {
    const g = new SpatialGrid(200, 200, 20, 8);
    const out = new Int32Array(8);
    g.begin();
    g.add(1, 10, 10);
    g.end();
    g.begin();
    g.add(2, 150, 150);
    g.end();
    expect(g.query(10, 10, 5, out)).toBe(0);
    expect(g.query(150, 150, 5, out)).toBe(1);
    expect(out[0]).toBe(2);
  });

  it('never writes past the output buffer', () => {
    const g = new SpatialGrid(100, 100, 100, 50);
    g.begin();
    for (let i = 0; i < 50; i++) g.add(i, 50, 50);
    g.end();
    const out = new Int32Array(10);
    expect(g.query(50, 50, 10, out)).toBe(10);
  });
});
