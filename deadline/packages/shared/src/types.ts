import type {
  AIArchetype,
  AIBehaviourState,
  ContainerType,
  PlayerRaidState,
  RaidPhase,
  RaidResult,
} from './enums.js';
import type { Vec3 } from './math.js';

// ---------------------------------------------------------------- persistence

export interface PlayerProfile {
  readonly id: string;
  readonly username: string;
  readonly level: number;
  readonly xp: number;
  readonly credits: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerStats {
  readonly playerId: string;
  readonly raids: number;
  readonly successfulExtractions: number;
  readonly deaths: number;
  readonly playerKills: number;
  readonly aiKills: number;
  readonly lootExtractedValue: number;
  readonly damageDealt: number;
  readonly playtimeSeconds: number;
}

/** One stack occupying a rectangle of a grid container. */
export interface InventoryEntry {
  readonly id: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly x: number;
  readonly y: number;
  readonly rotated: boolean;
  /** Present for weapon stacks: rounds currently in the magazine. */
  readonly ammoInMag?: number;
  /** Present for armour stacks: remaining durability as armour points. */
  readonly durability?: number;
}

export interface GridSize {
  readonly width: number;
  readonly height: number;
}

export interface PlayerLoadout {
  readonly id: string;
  readonly playerId: string;
  readonly name: string;
  readonly primaryWeaponId: string | null;
  readonly secondaryWeaponId: string | null;
  readonly armorItemId: string | null;
  readonly perkIds: readonly string[];
  /** Items pre-loaded into the backpack at deploy, referencing stash stacks. */
  readonly backpack: readonly InventoryEntry[];
  readonly secure: readonly InventoryEntry[];
}

export interface RaidHistoryEntry {
  readonly id: string;
  readonly playerId: string;
  readonly roomId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly result: RaidResult;
  readonly survivalSeconds: number;
  readonly playerKills: number;
  readonly aiKills: number;
  readonly lootValue: number;
  readonly xpEarned: number;
}

export interface LeaderboardRow {
  readonly rank: number;
  readonly playerId: string;
  readonly username: string;
  readonly level: number;
  readonly lootExtractedValue: number;
  readonly playerKills: number;
  readonly successfulExtractions: number;
}

export interface MissionProgress {
  readonly missionId: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly claimedAt: string | null;
  readonly daily: boolean;
  readonly resetKey: string | null;
}

// --------------------------------------------------------------- raid runtime

/** Serialisable snapshot of a player as the client sees it. */
export interface PlayerSnapshot {
  readonly sessionId: string;
  readonly userId: string;
  readonly username: string;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly pitch: number;
  readonly velocity: Vec3;
  readonly health: number;
  readonly armor: number;
  readonly stamina: number;
  readonly state: PlayerRaidState;
  readonly sprinting: boolean;
  readonly crouching: boolean;
  readonly ads: boolean;
  readonly reloading: boolean;
  readonly currentWeaponId: string | null;
  readonly ammoInMag: number;
  readonly reserveAmmo: number;
  readonly isBot: boolean;
  readonly kills: number;
  readonly aiKills: number;
  readonly damageDealt: number;
  readonly extractionProgress: number;
  readonly extractionPointId: string | null;
}

export interface AISnapshot {
  readonly id: string;
  readonly archetype: AIArchetype;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly behaviour: AIBehaviourState;
  readonly alive: boolean;
}

export interface LootContainerSnapshot {
  readonly id: string;
  readonly containerType: ContainerType;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly opened: boolean;
  readonly empty: boolean;
  readonly lockedRoomId: string | null;
  readonly poiId: string;
}

export interface WorldItemSnapshot {
  readonly id: string;
  readonly containerId: string;
  readonly itemId: string;
  readonly quantity: number;
}

export interface MatchSnapshot {
  readonly phase: RaidPhase;
  readonly timeRemaining: number;
  readonly elapsed: number;
  readonly seed: number;
  readonly mapId: string;
}

// ------------------------------------------------------------- raid reporting

export interface RaidLootLine {
  readonly itemId: string;
  readonly quantity: number;
  readonly value: number;
}

export interface RaidSummary {
  readonly raidId: string;
  readonly roomId: string;
  readonly result: RaidResult;
  readonly survivalSeconds: number;
  readonly playerKills: number;
  readonly aiKills: number;
  readonly damageDealt: number;
  readonly lootValue: number;
  readonly loot: readonly RaidLootLine[];
  readonly xpEarned: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly creditsEarned: number;
  readonly completedMissions: readonly string[];
}

export interface DeployRequest {
  readonly loadoutId: string | null;
  readonly mapId: string;
}

/** Everything the game server needs to spawn a player, fetched from Supabase. */
export interface DeployProfile {
  readonly userId: string;
  readonly username: string;
  readonly level: number;
  readonly perkIds: readonly string[];
  readonly primaryWeaponId: string | null;
  readonly secondaryWeaponId: string | null;
  readonly armorItemId: string | null;
  readonly backpack: readonly InventoryEntry[];
  readonly secure: readonly InventoryEntry[];
}

export interface SuspiciousEvent {
  readonly playerId: string;
  readonly roomId: string;
  readonly kind:
    | 'speed_hack'
    | 'position_teleport'
    | 'fire_rate'
    | 'ammo'
    | 'interaction_range'
    | 'loot_ownership'
    | 'extraction_position'
    | 'invalid_state'
    | 'schema';
  readonly detail: string;
  readonly at: string;
}
