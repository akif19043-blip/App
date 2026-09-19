import {
  AI_LOOT_TABLES,
  CONTAINER_DEFINITIONS,
  ContainerType,
  ITEM_CATALOG,
  ItemCategory,
  RARITY_ORDER,
  RISK_LOOT_MULTIPLIER,
  type Rarity,
  type RiskLevel,
  getItem,
  type ContainerDefinition,
  type ItemDefinition,
  type RarityWeights,
  type Rng,
} from '@deadline/shared';

export interface LootRollEntry {
  readonly itemId: string;
  readonly quantity: number;
}

export interface LootRollOptions {
  /** Risk tier of the POI the container sits in. */
  readonly risk?: RiskLevel;
  /** Global loot multiplier from the server config. */
  readonly lootMultiplier?: number;
  /** Perk-driven chance of one extra roll (Scavenger). */
  readonly extraRollChance?: number;
  /** Categories to exclude entirely (e.g. keys outside their own district). */
  readonly excludeCategories?: readonly ItemCategory[];
}

/** Items that may only spawn from specific containers, never from the pool. */
const RESTRICTED_ITEMS: ReadonlySet<string> = new Set(['ai_core']);

/** Key items only spawn from high-tier containers, so they stay meaningful. */
const KEY_CONTAINERS: ReadonlySet<ContainerType> = new Set([
  ContainerType.MilitaryCrate,
  ContainerType.HiddenCache,
  ContainerType.WeaponRack,
  ContainerType.SupplyDrop,
]);

function poolFor(
  definition: ContainerDefinition,
  rarity: Rarity,
  options: LootRollOptions,
): readonly ItemDefinition[] {
  const allowedCategories = definition.categories;
  const excluded = options.excludeCategories ?? [];
  return ITEM_CATALOG.filter((item) => {
    if (item.rarity !== rarity) return false;
    if (RESTRICTED_ITEMS.has(item.id)) return false;
    if (excluded.includes(item.category)) return false;
    if (allowedCategories.length > 0 && !allowedCategories.includes(item.category)) return false;
    if (item.category === ItemCategory.Key && !KEY_CONTAINERS.has(definition.type)) return false;
    return true;
  });
}

function rollRarity(weights: RarityWeights, rng: Rng): Rarity {
  const table = RARITY_ORDER.map((rarity) => [rarity, weights[rarity]] as const);
  return rng.weighted(table);
}

function quantityFor(item: ItemDefinition, rng: Rng): number {
  if (item.stackSize <= 1) return 1;
  // Cheap items come in bigger piles than valuable ones.
  const ceiling = item.value > 1_500 ? 1 : Math.min(item.stackSize, item.value > 400 ? 2 : 4);
  return rng.int(1, Math.max(1, ceiling));
}

/**
 * Roll the contents of one container.
 *
 * All loot generation is server side; the client only ever receives the result
 * after the container has been opened.
 */
export function rollContainer(
  containerType: ContainerType,
  rng: Rng,
  options: LootRollOptions = {},
): LootRollEntry[] {
  const definition = CONTAINER_DEFINITIONS[containerType];
  if (!definition) return [];

  const riskMultiplier = options.risk ? RISK_LOOT_MULTIPLIER[options.risk] : 1;
  const globalMultiplier = options.lootMultiplier ?? 1;
  const base = rng.int(definition.minRolls, definition.maxRolls);
  let rolls = Math.round(base * riskMultiplier * globalMultiplier);
  if (options.extraRollChance && rng.bool(options.extraRollChance)) rolls += 1;
  rolls = Math.max(definition.minRolls > 0 ? 1 : 0, rolls);

  const results: LootRollEntry[] = [];
  for (let i = 0; i < rolls; i += 1) {
    const item = pickItem(definition, rng, options);
    if (!item) continue;
    results.push({ itemId: item.id, quantity: quantityFor(item, rng) });
  }
  return results;
}

function pickItem(
  definition: ContainerDefinition,
  rng: Rng,
  options: LootRollOptions,
): ItemDefinition | null {
  let rarity = rollRarity(definition.weights, rng);
  // Walk down the rarity ladder when the chosen tier has no eligible items.
  for (let attempt = 0; attempt < RARITY_ORDER.length; attempt += 1) {
    const pool = poolFor(definition, rarity, options);
    if (pool.length > 0) return rng.pick(pool);
    const index = RARITY_ORDER.indexOf(rarity);
    if (index <= 0) break;
    rarity = RARITY_ORDER[index - 1] as Rarity;
  }
  return null;
}

/** Loot dropped by an AI enemy when it dies. */
export function rollAILoot(archetype: string, rng: Rng, options: LootRollOptions = {}): LootRollEntry[] {
  const table = AI_LOOT_TABLES[archetype];
  if (!table) return [];
  const multiplier = options.lootMultiplier ?? 1;
  const rolls = Math.max(1, Math.round(rng.int(table.minRolls, table.maxRolls) * multiplier));
  const pseudoDefinition: ContainerDefinition = {
    type: ContainerType.Corpse,
    name: 'Body',
    minRolls: table.minRolls,
    maxRolls: table.maxRolls,
    weights: table.weights,
    categories: [],
    searchTimeSeconds: 1,
  };
  const results: LootRollEntry[] = [];
  for (let i = 0; i < rolls; i += 1) {
    const item = pickItem(pseudoDefinition, rng, options);
    if (item) results.push({ itemId: item.id, quantity: quantityFor(item, rng) });
  }
  return results;
}

/** Credit value of a roll result — used by tests and the post-match screen. */
export function lootValue(entries: readonly LootRollEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    const def = getItem(entry.itemId);
    if (def) total += def.value * entry.quantity;
  }
  return total;
}
