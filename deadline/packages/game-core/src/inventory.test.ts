import { describe, expect, it } from 'vitest';
import { INVENTORY, requireItem } from '@deadline/shared';
import { GridInventory } from './inventory.js';

describe('grid inventory placement', () => {
  it('starts empty with the configured dimensions', () => {
    const backpack = GridInventory.backpack();
    expect(backpack.width).toBe(INVENTORY.backpackWidth);
    expect(backpack.height).toBe(INVENTORY.backpackHeight);
    expect(backpack.size()).toBe(0);
  });

  it('places a 1x1 item in the first free cell', () => {
    const backpack = GridInventory.backpack();
    const result = backpack.addItem('scrap_metal', 1);
    expect(result.ok).toBe(true);
    expect(result.entry?.x).toBe(0);
    expect(result.entry?.y).toBe(0);
  });

  it('rejects overlapping placements', () => {
    const backpack = GridInventory.backpack();
    const first = backpack.addItem('military_battery', 1); // 2x2
    expect(first.ok).toBe(true);
    expect(backpack.canPlace('military_battery', 0, 0, false)).toBe(false);
    expect(backpack.canPlace('military_battery', 1, 1, false)).toBe(false);
    expect(backpack.canPlace('military_battery', 2, 0, false)).toBe(true);
  });

  it('rejects placements that fall outside the grid', () => {
    const backpack = GridInventory.backpack();
    expect(backpack.canPlace('military_battery', INVENTORY.backpackWidth - 1, 0, false)).toBe(false);
    expect(backpack.canPlace('scrap_metal', -1, 0, false)).toBe(false);
    expect(backpack.canPlace('scrap_metal', 0, INVENTORY.backpackHeight, false)).toBe(false);
  });

  it('honours rotation when checking fit', () => {
    const secure = GridInventory.secure(); // 2x2
    // Medical kit is 2x1: fits unrotated and rotated inside a 2x2 grid.
    expect(secure.canPlace('medical_kit', 0, 0, false)).toBe(true);
    expect(secure.canPlace('medical_kit', 0, 0, true)).toBe(true);
    // armor_heavy_plate is 2x3 and cannot fit either way.
    expect(secure.canPlace('armor_heavy_plate', 0, 0, false)).toBe(false);
    expect(secure.canPlace('armor_heavy_plate', 0, 0, true)).toBe(false);
  });

  it('fills existing stacks before opening a new slot', () => {
    const backpack = GridInventory.backpack();
    const def = requireItem('scrap_metal');
    backpack.addItem('scrap_metal', def.stackSize - 1);
    expect(backpack.size()).toBe(1);
    backpack.addItem('scrap_metal', 1);
    expect(backpack.size()).toBe(1);
    expect(backpack.countOf('scrap_metal')).toBe(def.stackSize);
    backpack.addItem('scrap_metal', 1);
    expect(backpack.size()).toBe(2);
  });

  it('reports what did not fit when the grid is full', () => {
    const secure = GridInventory.secure(); // 2x2 = 4 cells
    secure.addItem('military_battery', 1); // consumes the whole grid
    const overflow = secure.addItem('gold_watch', 3);
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toBe('no_space');
    expect(overflow.remaining).toBe(3);
  });

  it('frees cells when an entry is removed', () => {
    const backpack = GridInventory.backpack();
    const placed = backpack.addItem('military_battery', 1);
    const entryId = placed.entry!.id;
    expect(backpack.canPlace('military_battery', 0, 0, false)).toBe(false);
    backpack.remove(entryId);
    expect(backpack.canPlace('military_battery', 0, 0, false)).toBe(true);
    expect(backpack.size()).toBe(0);
  });

  it('moves an entry and restores it when the target is occupied', () => {
    const backpack = GridInventory.backpack();
    const a = backpack.addItem('military_battery', 1).entry!;
    const b = backpack.addItem('military_battery', 1).entry!;
    const blocked = backpack.move(b.id, a.x, a.y, false);
    expect(blocked.ok).toBe(false);
    expect(backpack.get(b.id)!.x).toBe(b.x);

    const free = backpack.move(b.id, 4, 3, false);
    expect(free.ok).toBe(true);
    expect(backpack.get(b.id)!.x).toBe(4);
    expect(backpack.get(b.id)!.y).toBe(3);
  });

  it('consumes across stacks', () => {
    const stash = GridInventory.stash();
    stash.addItem('bandage', 10);
    expect(stash.countOf('bandage')).toBe(10);
    expect(stash.consume('bandage', 7)).toBe(7);
    expect(stash.countOf('bandage')).toBe(3);
    expect(stash.consume('bandage', 99)).toBe(3);
    expect(stash.has('bandage')).toBe(false);
  });

  it('computes total value and weight', () => {
    const backpack = GridInventory.backpack();
    backpack.addItem('gold_watch', 2);
    const watch = requireItem('gold_watch');
    expect(backpack.totalValue()).toBe(watch.value * 2);
    expect(backpack.totalWeight()).toBeCloseTo(watch.weight * 2, 2);
  });

  it('round-trips through serialisation', () => {
    const backpack = GridInventory.backpack();
    backpack.addItem('ar12', 1, { ammoInMag: 12 });
    backpack.addItem('bandage', 3);
    const json = backpack.toJSON();
    const restored = GridInventory.backpack(json.entries);
    expect(restored.size()).toBe(backpack.size());
    expect(restored.countOf('bandage')).toBe(3);
    const rifle = restored.list().find((entry) => entry.itemId === 'ar12');
    expect(rifle?.ammoInMag).toBe(12);
  });

  it('rejects unknown item ids', () => {
    const backpack = GridInventory.backpack();
    const result = backpack.addItem('not_a_real_item', 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_item');
  });
});
