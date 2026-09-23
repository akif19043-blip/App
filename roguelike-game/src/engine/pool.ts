/**
 * Fixed-capacity object pool. All objects are allocated up front so the hot
 * loop never allocates. Live objects occupy indices [0, count).
 *
 * Objects are killed by clearing `active`; `compact()` (run once per tick)
 * swaps dead objects past the end. Indices therefore stay stable within a
 * tick, which lets the spatial grid store plain indices.
 */
export interface Poolable {
  active: boolean;
}

export class Pool<T extends Poolable> {
  readonly items: T[];
  count = 0;

  constructor(factory: () => T, readonly capacity: number) {
    this.items = new Array<T>(capacity);
    for (let i = 0; i < capacity; i++) {
      const it = factory();
      it.active = false;
      this.items[i] = it;
    }
  }

  /** Returns a fresh object, or null when the pool is exhausted. */
  obtain(): T | null {
    if (this.count >= this.capacity) return null;
    const it = this.items[this.count++];
    it.active = true;
    return it;
  }

  get full(): boolean {
    return this.count >= this.capacity;
  }

  /** Moves inactive objects past `count`, keeping every object allocated. */
  compact(): void {
    const items = this.items;
    let i = 0;
    while (i < this.count) {
      if (items[i].active) {
        i++;
        continue;
      }
      const last = --this.count;
      const tmp = items[i];
      items[i] = items[last];
      items[last] = tmp;
    }
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) this.items[i].active = false;
    this.count = 0;
  }
}
