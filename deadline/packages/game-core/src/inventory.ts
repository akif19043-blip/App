import {
  INVENTORY,
  InventoryContainerKind,
  getItem,
  type InventoryEntry,
  type ItemDefinition,
  type SerializedInventory,
} from '@deadline/shared';

let entryCounter = 0;

/** Ids are only unique per process; persistence assigns database ids. */
export function nextEntryId(prefix = 'e'): string {
  entryCounter += 1;
  return `${prefix}${entryCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export interface MutableEntry {
  id: string;
  itemId: string;
  quantity: number;
  x: number;
  y: number;
  rotated: boolean;
  ammoInMag?: number;
  durability?: number;
}

export interface PlacementResult {
  readonly ok: boolean;
  readonly reason?: 'no_space' | 'occupied' | 'out_of_bounds' | 'unknown_item' | 'not_found';
  readonly entry?: MutableEntry;
  /** Units that did not fit. */
  readonly remaining: number;
}

/**
 * Tarkov-style grid container.
 *
 * Both the raid backpack and the persistent stash are instances of this class,
 * which is what makes "extract → stash" a single transfer operation rather than
 * a bespoke code path.
 */
export class GridInventory {
  readonly kind: InventoryContainerKind;
  readonly width: number;
  readonly height: number;
  private readonly entries: Map<string, MutableEntry> = new Map();
  /** Occupancy map storing the owning entry id, or null. */
  private readonly cells: (string | null)[];

  constructor(
    kind: InventoryContainerKind,
    width: number,
    height: number,
    initial: readonly InventoryEntry[] = [],
  ) {
    this.kind = kind;
    this.width = width;
    this.height = height;
    this.cells = new Array<string | null>(width * height).fill(null);
    for (const entry of initial) {
      this.placeAt(
        {
          id: entry.id || nextEntryId(),
          itemId: entry.itemId,
          quantity: entry.quantity,
          x: entry.x,
          y: entry.y,
          rotated: entry.rotated,
          ...(entry.ammoInMag !== undefined ? { ammoInMag: entry.ammoInMag } : {}),
          ...(entry.durability !== undefined ? { durability: entry.durability } : {}),
        },
        entry.x,
        entry.y,
        entry.rotated,
      );
    }
  }

  static backpack(initial: readonly InventoryEntry[] = []): GridInventory {
    return new GridInventory(
      InventoryContainerKind.Backpack,
      INVENTORY.backpackWidth,
      INVENTORY.backpackHeight,
      initial,
    );
  }

  static secure(initial: readonly InventoryEntry[] = []): GridInventory {
    return new GridInventory(
      InventoryContainerKind.Secure,
      INVENTORY.secureWidth,
      INVENTORY.secureHeight,
      initial,
    );
  }

  static stash(initial: readonly InventoryEntry[] = []): GridInventory {
    return new GridInventory(
      InventoryContainerKind.Stash,
      INVENTORY.stashWidth,
      INVENTORY.stashHeight,
      initial,
    );
  }

  /** Footprint of an item, accounting for rotation. */
  static footprint(def: ItemDefinition, rotated: boolean): { w: number; h: number } {
    return rotated ? { w: def.height, h: def.width } : { w: def.width, h: def.height };
  }

  list(): MutableEntry[] {
    return [...this.entries.values()];
  }

  get(entryId: string): MutableEntry | undefined {
    return this.entries.get(entryId);
  }

  size(): number {
    return this.entries.size;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  /** True when the rectangle is inside the grid and free (ignoring `ignoreId`). */
  canPlace(itemId: string, x: number, y: number, rotated: boolean, ignoreId?: string): boolean {
    const def = getItem(itemId);
    if (!def) return false;
    const { w, h } = GridInventory.footprint(def, rotated);
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) return false;
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        const occupant = this.cells[this.index(x + dx, y + dy)];
        if (occupant && occupant !== ignoreId) return false;
      }
    }
    return true;
  }

  private stamp(entry: MutableEntry, value: string | null): void {
    const def = getItem(entry.itemId);
    if (!def) return;
    const { w, h } = GridInventory.footprint(def, entry.rotated);
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        this.cells[this.index(entry.x + dx, entry.y + dy)] = value;
      }
    }
  }

  private placeAt(entry: MutableEntry, x: number, y: number, rotated: boolean): boolean {
    if (!this.canPlace(entry.itemId, x, y, rotated, entry.id)) return false;
    if (this.entries.has(entry.id)) this.stamp(this.entries.get(entry.id)!, null);
    entry.x = x;
    entry.y = y;
    entry.rotated = rotated;
    this.entries.set(entry.id, entry);
    this.stamp(entry, entry.id);
    return true;
  }

  /** First free position for the item, trying both orientations. */
  findFreeSlot(itemId: string): { x: number; y: number; rotated: boolean } | null {
    const def = getItem(itemId);
    if (!def) return null;
    const orientations = def.width === def.height ? [false] : [false, true];
    for (const rotated of orientations) {
      const { w, h } = GridInventory.footprint(def, rotated);
      for (let y = 0; y + h <= this.height; y += 1) {
        for (let x = 0; x + w <= this.width; x += 1) {
          if (this.canPlace(itemId, x, y, rotated)) return { x, y, rotated };
        }
      }
    }
    return null;
  }

  /**
   * Add `quantity` units of an item, filling existing stacks first.
   * Returns how many units could not be stored.
   */
  addItem(
    itemId: string,
    quantity: number,
    meta: { ammoInMag?: number; durability?: number } = {},
  ): PlacementResult {
    const def = getItem(itemId);
    if (!def) return { ok: false, reason: 'unknown_item', remaining: quantity };
    let remaining = Math.max(0, Math.floor(quantity));
    let lastEntry: MutableEntry | undefined;

    if (def.stackSize > 1) {
      for (const entry of this.entries.values()) {
        if (remaining <= 0) break;
        if (entry.itemId !== itemId) continue;
        const room = def.stackSize - entry.quantity;
        if (room <= 0) continue;
        const moved = Math.min(room, remaining);
        entry.quantity += moved;
        remaining -= moved;
        lastEntry = entry;
      }
    }

    while (remaining > 0) {
      const slot = this.findFreeSlot(itemId);
      if (!slot) break;
      const amount = Math.min(def.stackSize, remaining);
      const entry: MutableEntry = {
        id: nextEntryId(),
        itemId,
        quantity: amount,
        x: slot.x,
        y: slot.y,
        rotated: slot.rotated,
        ...(meta.ammoInMag !== undefined ? { ammoInMag: meta.ammoInMag } : {}),
        ...(meta.durability !== undefined ? { durability: meta.durability } : {}),
      };
      if (!this.placeAt(entry, slot.x, slot.y, slot.rotated)) break;
      remaining -= amount;
      lastEntry = entry;
    }

    return {
      ok: remaining === 0,
      ...(remaining > 0 ? { reason: 'no_space' as const } : {}),
      ...(lastEntry ? { entry: lastEntry } : {}),
      remaining,
    };
  }

  /** Place an existing entry (preserving its id and metadata) at an exact cell. */
  addEntryAt(entry: MutableEntry, x: number, y: number, rotated: boolean): PlacementResult {
    if (!getItem(entry.itemId)) return { ok: false, reason: 'unknown_item', remaining: entry.quantity };
    if (!this.canPlace(entry.itemId, x, y, rotated, entry.id)) {
      return { ok: false, reason: 'occupied', remaining: entry.quantity };
    }
    this.placeAt(entry, x, y, rotated);
    return { ok: true, entry, remaining: 0 };
  }

  move(entryId: string, x: number, y: number, rotated: boolean): PlacementResult {
    const entry = this.entries.get(entryId);
    if (!entry) return { ok: false, reason: 'not_found', remaining: 0 };
    const previous = { x: entry.x, y: entry.y, rotated: entry.rotated };
    this.stamp(entry, null);
    if (!this.canPlace(entry.itemId, x, y, rotated, entry.id)) {
      entry.x = previous.x;
      entry.y = previous.y;
      entry.rotated = previous.rotated;
      this.stamp(entry, entry.id);
      return { ok: false, reason: 'occupied', remaining: 0 };
    }
    entry.x = x;
    entry.y = y;
    entry.rotated = rotated;
    this.stamp(entry, entry.id);
    return { ok: true, entry, remaining: 0 };
  }

  remove(entryId: string): MutableEntry | null {
    const entry = this.entries.get(entryId);
    if (!entry) return null;
    this.stamp(entry, null);
    this.entries.delete(entryId);
    return entry;
  }

  /** Remove `quantity` units of an item id, across stacks. Returns units removed. */
  consume(itemId: string, quantity: number): number {
    let remaining = quantity;
    for (const entry of [...this.entries.values()]) {
      if (remaining <= 0) break;
      if (entry.itemId !== itemId) continue;
      const taken = Math.min(entry.quantity, remaining);
      entry.quantity -= taken;
      remaining -= taken;
      if (entry.quantity <= 0) this.remove(entry.id);
    }
    return quantity - remaining;
  }

  countOf(itemId: string): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      if (entry.itemId === itemId) total += entry.quantity;
    }
    return total;
  }

  has(itemId: string): boolean {
    return this.countOf(itemId) > 0;
  }

  totalValue(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      const def = getItem(entry.itemId);
      if (def) total += def.value * entry.quantity;
    }
    return total;
  }

  totalWeight(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      const def = getItem(entry.itemId);
      if (def) total += def.weight * entry.quantity;
    }
    return Math.round(total * 100) / 100;
  }

  clear(): MutableEntry[] {
    const all = this.list();
    this.entries.clear();
    this.cells.fill(null);
    return all;
  }

  toJSON(): SerializedInventory {
    return {
      kind: this.kind,
      width: this.width,
      height: this.height,
      entries: this.list().map((entry) => ({
        id: entry.id,
        itemId: entry.itemId,
        quantity: entry.quantity,
        x: entry.x,
        y: entry.y,
        rotated: entry.rotated,
        ...(entry.ammoInMag !== undefined ? { ammoInMag: entry.ammoInMag } : {}),
        ...(entry.durability !== undefined ? { durability: entry.durability } : {}),
      })),
    };
  }

  toEntries(): InventoryEntry[] {
    return this.toJSON().entries;
  }
}
