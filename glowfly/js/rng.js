/**
 * Seeded random numbers (mulberry32). A run gets its own stream, so a test
 * can replay the same night exactly and the visuals' randomness never
 * changes what the simulation does.
 */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (n) => Math.floor(next() * n);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  /** A key of `weights` ({key: weight}), chosen in proportion. */
  next.weighted = (weights) => {
    let total = 0;
    for (const key in weights) total += weights[key];
    let roll = next() * total;
    for (const key in weights) {
      roll -= weights[key];
      if (roll <= 0) return key;
    }
    return Object.keys(weights)[0];
  };
  return next;
}
