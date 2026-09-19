/**
 * Core enumerations shared by the web client, the authoritative game server and
 * the persistence layer. Values are stable strings so they can be written to
 * Postgres and read back without a lookup table.
 */

export const Rarity = {
  Common: 'common',
  Uncommon: 'uncommon',
  Rare: 'rare',
  Epic: 'epic',
  Legendary: 'legendary',
} as const;
export type Rarity = (typeof Rarity)[keyof typeof Rarity];

export const RARITY_ORDER: readonly Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
  Rarity.Legendary,
];

export const ItemCategory = {
  Weapon: 'weapon',
  Armor: 'armor',
  Medical: 'medical',
  Electronics: 'electronics',
  Valuable: 'valuable',
  Crafting: 'crafting',
  Quest: 'quest',
  Ammo: 'ammo',
  Key: 'key',
} as const;
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory];

export const WeaponCategory = {
  Pistol: 'pistol',
  SMG: 'smg',
  AssaultRifle: 'assault_rifle',
  DMR: 'dmr',
  Shotgun: 'shotgun',
} as const;
export type WeaponCategory = (typeof WeaponCategory)[keyof typeof WeaponCategory];

export const AmmoType = {
  Light: 'ammo_light',
  Medium: 'ammo_medium',
  Heavy: 'ammo_heavy',
  Shell: 'ammo_shell',
} as const;
export type AmmoType = (typeof AmmoType)[keyof typeof AmmoType];

/** Room-level lifecycle. Transitions are validated server side. */
export const RaidPhase = {
  Waiting: 'WAITING',
  Countdown: 'COUNTDOWN',
  Active: 'ACTIVE',
  FinalPhase: 'FINAL_PHASE',
  Ended: 'ENDED',
} as const;
export type RaidPhase = (typeof RaidPhase)[keyof typeof RaidPhase];

/** Per-player lifecycle inside a raid. */
export const PlayerRaidState = {
  Deploying: 'DEPLOYING',
  Alive: 'ALIVE',
  Extracting: 'EXTRACTING',
  Extracted: 'EXTRACTED',
  Dead: 'DEAD',
  MIA: 'MIA',
} as const;
export type PlayerRaidState = (typeof PlayerRaidState)[keyof typeof PlayerRaidState];

export const RaidResult = {
  Extracted: 'extracted',
  KIA: 'kia',
  MIA: 'mia',
} as const;
export type RaidResult = (typeof RaidResult)[keyof typeof RaidResult];

export const AIArchetype = {
  Scavenger: 'scavenger',
  Guard: 'guard',
  Heavy: 'heavy',
} as const;
export type AIArchetype = (typeof AIArchetype)[keyof typeof AIArchetype];

export const AIBehaviourState = {
  Idle: 'idle',
  Patrol: 'patrol',
  Detect: 'detect',
  Chase: 'chase',
  Attack: 'attack',
  Search: 'search',
  Return: 'return',
  Dead: 'dead',
} as const;
export type AIBehaviourState = (typeof AIBehaviourState)[keyof typeof AIBehaviourState];

export const ContainerType = {
  CivilianCrate: 'civilian_crate',
  Locker: 'locker',
  Cabinet: 'cabinet',
  Vehicle: 'vehicle',
  MilitaryCrate: 'military_crate',
  HiddenCache: 'hidden_cache',
  MedicalCabinet: 'medical_cabinet',
  WeaponRack: 'weapon_rack',
  SupplyDrop: 'supply_drop',
  Corpse: 'corpse',
} as const;
export type ContainerType = (typeof ContainerType)[keyof typeof ContainerType];

export const RiskLevel = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  VeryHigh: 'very_high',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const MissionType = {
  KillAI: 'kill_ai',
  KillPlayers: 'kill_players',
  Extract: 'extract',
  CollectItem: 'collect_item',
  VisitLocation: 'visit_location',
  LootValue: 'loot_value',
} as const;
export type MissionType = (typeof MissionType)[keyof typeof MissionType];

export const BotDifficulty = {
  Easy: 'easy',
  Normal: 'normal',
  Hard: 'hard',
} as const;
export type BotDifficulty = (typeof BotDifficulty)[keyof typeof BotDifficulty];

export const InventoryContainerKind = {
  Backpack: 'backpack',
  Secure: 'secure',
  Stash: 'stash',
} as const;
export type InventoryContainerKind =
  (typeof InventoryContainerKind)[keyof typeof InventoryContainerKind];
