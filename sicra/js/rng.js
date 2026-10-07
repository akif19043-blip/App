/**
 * Seeded random numbers (mulberry32). The track is generated from one of
 * these so a run can be replayed exactly and tests can ask for a specific
 * layout instead of hoping for one.
 */

export class Rng {
  constructor(seed = Date.now() >>> 0) {
    this.seed = seed >>> 0;
    this.state = this.seed || 1;
  }

  /** Uniform in [0, 1). */
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** Pick a key from `{ key: { weight } }`. */
  weighted(table) {
    const keys = Object.keys(table);
    let total = 0;
    for (const key of keys) total += table[key].weight;
    let roll = this.next() * total;
    for (const key of keys) {
      roll -= table[key].weight;
      if (roll <= 0) return key;
    }
    return keys[keys.length - 1];
  }
}
