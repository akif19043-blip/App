import { describe, expect, it } from 'vitest';
import { Pool } from '../src/engine/pool';

describe('Pool', () => {
  it('preallocates and reuses objects without growing', () => {
    let created = 0;
    const pool = new Pool(() => ({ active: false, v: created++ }), 4);
    expect(created).toBe(4);
    const a = pool.obtain()!;
    const b = pool.obtain()!;
    pool.obtain();
    pool.obtain();
    expect(pool.obtain()).toBeNull();
    expect(pool.full).toBe(true);
    a.active = false;
    b.active = false;
    pool.compact();
    expect(pool.count).toBe(2);
    for (let i = 0; i < pool.count; i++) expect(pool.items[i].active).toBe(true);
    const c = pool.obtain()!;
    expect([a, b]).toContain(c);
    expect(created).toBe(4);
  });

  it('keeps every object when compacting', () => {
    const pool = new Pool(() => ({ active: false }), 100);
    const all = new Set(pool.items);
    for (let i = 0; i < 100; i++) pool.obtain();
    for (let i = 0; i < 100; i += 3) pool.items[i].active = false;
    pool.compact();
    expect(pool.count).toBe(66);
    expect(new Set(pool.items)).toEqual(all);
  });
});
