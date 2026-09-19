/**
 * Small deterministic PRNG utilities.
 *
 * Every random decision that both the client and the server must agree on
 * (map generation, loot rolls, spread patterns) goes through a seeded
 * generator so a raid can be reproduced from its seed alone.
 */

/** mulberry32 — fast, good enough distribution, identical across platforms. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  float(min: number, max: number): number;
  bool(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
}

/** Wraps a seeded generator with the helpers gameplay code actually needs. */
export function makeRng(seed: number): Rng {
  const next = createRng(seed);
  return {
    next,
    int(minInclusive, maxInclusive) {
      if (maxInclusive <= minInclusive) return minInclusive;
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    bool(probability = 0.5) {
      return next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Rng.pick called with an empty list');
      const item = items[Math.floor(next() * items.length)];
      return item as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const a = out[i] as T;
        const b = out[j] as T;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
    weighted<T>(entries: readonly (readonly [T, number])[]): T {
      let total = 0;
      for (const [, weight] of entries) total += Math.max(0, weight);
      if (total <= 0) {
        const first = entries[0];
        if (!first) throw new Error('Rng.weighted called with an empty table');
        return first[0];
      }
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= Math.max(0, weight);
        if (roll <= 0) return value;
      }
      const last = entries[entries.length - 1];
      if (!last) throw new Error('Rng.weighted called with an empty table');
      return last[0];
    },
  };
}

/** Deterministic 32-bit hash of a string, used to seed per-raid generators. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
