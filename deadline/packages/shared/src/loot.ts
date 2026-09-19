import { ContainerType, ItemCategory, Rarity } from './enums.js';

/** Probability weights per rarity tier for one roll from a container. */
export type RarityWeights = Readonly<Record<Rarity, number>>;

export interface ContainerDefinition {
  readonly type: ContainerType;
  readonly name: string;
  /** Minimum / maximum item stacks rolled when the container is opened. */
  readonly minRolls: number;
  readonly maxRolls: number;
  readonly weights: RarityWeights;
  /**
   * Categories this container can produce. An empty list means "anything".
   * Used to give the hospital medical loot, the armoury weapons, and so on.
   */
  readonly categories: readonly ItemCategory[];
  /** Seconds the search animation takes before the contents are revealed. */
  readonly searchTimeSeconds: number;
}

const w = (
  common: number,
  uncommon: number,
  rare: number,
  epic: number,
  legendary: number,
): RarityWeights => ({
  [Rarity.Common]: common,
  [Rarity.Uncommon]: uncommon,
  [Rarity.Rare]: rare,
  [Rarity.Epic]: epic,
  [Rarity.Legendary]: legendary,
});

export const CONTAINER_DEFINITIONS: Readonly<Record<ContainerType, ContainerDefinition>> = {
  [ContainerType.CivilianCrate]: {
    type: ContainerType.CivilianCrate,
    name: 'Civilian Crate',
    minRolls: 1,
    maxRolls: 3,
    weights: w(70, 25, 5, 0, 0),
    categories: [],
    searchTimeSeconds: 1.4,
  },
  [ContainerType.Locker]: {
    type: ContainerType.Locker,
    name: 'Locker',
    minRolls: 1,
    maxRolls: 2,
    weights: w(62, 28, 9, 1, 0),
    categories: [],
    searchTimeSeconds: 1.6,
  },
  [ContainerType.Cabinet]: {
    type: ContainerType.Cabinet,
    name: 'Cabinet',
    minRolls: 1,
    maxRolls: 3,
    weights: w(66, 26, 7, 1, 0),
    categories: [],
    searchTimeSeconds: 1.3,
  },
  [ContainerType.Vehicle]: {
    type: ContainerType.Vehicle,
    name: 'Abandoned Vehicle',
    minRolls: 1,
    maxRolls: 2,
    weights: w(55, 32, 11, 2, 0),
    categories: [],
    searchTimeSeconds: 2,
  },
  [ContainerType.MedicalCabinet]: {
    type: ContainerType.MedicalCabinet,
    name: 'Medical Cabinet',
    minRolls: 1,
    maxRolls: 3,
    weights: w(48, 36, 14, 2, 0),
    categories: [ItemCategory.Medical, ItemCategory.Electronics],
    searchTimeSeconds: 1.8,
  },
  [ContainerType.WeaponRack]: {
    type: ContainerType.WeaponRack,
    name: 'Weapon Rack',
    minRolls: 1,
    maxRolls: 2,
    weights: w(34, 38, 22, 6, 0),
    categories: [ItemCategory.Weapon, ItemCategory.Ammo, ItemCategory.Armor],
    searchTimeSeconds: 2.4,
  },
  [ContainerType.MilitaryCrate]: {
    type: ContainerType.MilitaryCrate,
    name: 'Military Crate',
    minRolls: 2,
    maxRolls: 4,
    weights: w(30, 40, 20, 9, 1),
    categories: [],
    searchTimeSeconds: 3,
  },
  [ContainerType.HiddenCache]: {
    type: ContainerType.HiddenCache,
    name: 'Hidden Cache',
    minRolls: 2,
    maxRolls: 4,
    weights: w(14, 30, 34, 18, 4),
    categories: [],
    searchTimeSeconds: 3.5,
  },
  [ContainerType.SupplyDrop]: {
    type: ContainerType.SupplyDrop,
    name: 'Supply Drop',
    minRolls: 3,
    maxRolls: 5,
    weights: w(6, 18, 38, 30, 8),
    categories: [],
    searchTimeSeconds: 3.2,
  },
  [ContainerType.Corpse]: {
    type: ContainerType.Corpse,
    name: 'Body',
    minRolls: 0,
    maxRolls: 0,
    weights: w(100, 0, 0, 0, 0),
    categories: [],
    searchTimeSeconds: 1,
  },
};

/** Loot drop table for AI enemies, keyed by archetype. */
export const AI_LOOT_TABLES: Readonly<
  Record<string, { readonly minRolls: number; readonly maxRolls: number; readonly weights: RarityWeights }>
> = {
  scavenger: { minRolls: 1, maxRolls: 2, weights: w(72, 24, 4, 0, 0) },
  guard: { minRolls: 1, maxRolls: 3, weights: w(45, 38, 15, 2, 0) },
  heavy: { minRolls: 2, maxRolls: 4, weights: w(22, 38, 28, 11, 1) },
};

/** Multiplier applied to a POI's container rolls, expressing risk/reward. */
export const RISK_LOOT_MULTIPLIER = {
  low: 0.85,
  medium: 1,
  high: 1.2,
  very_high: 1.45,
} as const;
