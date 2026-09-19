import { BASE_ITEM_DEFINITIONS, type ItemDefinition } from './items.js';
import { WEAPON_ITEM_DEFINITIONS } from './weapons.js';
import { ItemCategory, type Rarity } from './enums.js';

/** Canonical item catalogue: hand-authored items plus derived weapon entries. */
export const ITEM_CATALOG: readonly ItemDefinition[] = [
  ...BASE_ITEM_DEFINITIONS,
  ...WEAPON_ITEM_DEFINITIONS,
];

const INDEX: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_CATALOG.map((item) => [item.id, item]),
);

if (INDEX.size !== ITEM_CATALOG.length) {
  throw new Error('Duplicate item id in the DEADLINE item catalogue');
}

export function getItem(id: string): ItemDefinition | undefined {
  return INDEX.get(id);
}

export function requireItem(id: string): ItemDefinition {
  const found = INDEX.get(id);
  if (!found) throw new Error(`Unknown item id: ${id}`);
  return found;
}

export function isWeaponItem(id: string): boolean {
  return getItem(id)?.category === ItemCategory.Weapon;
}

export function itemsOfCategory(category: ItemCategory): readonly ItemDefinition[] {
  return ITEM_CATALOG.filter((item) => item.category === category);
}

export function itemsOfRarity(rarity: Rarity): readonly ItemDefinition[] {
  return ITEM_CATALOG.filter((item) => item.rarity === rarity);
}

/** Total credit value of a flat list of item stacks. */
export function stackValue(entries: readonly { itemId: string; quantity: number }[]): number {
  let total = 0;
  for (const entry of entries) {
    const def = getItem(entry.itemId);
    if (!def) continue;
    total += def.value * entry.quantity;
  }
  return total;
}
