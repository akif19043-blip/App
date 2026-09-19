import type { RaidResult } from '@deadline/shared';

export type InventoryContainer = 'stash' | 'loadout_backpack' | 'loadout_secure';

export interface ProfileRecord {
  id: string;
  username: string;
  level: number;
  xp: number;
  credits: number;
  tutorialDone: boolean;
  createdAt: string;
}

export interface StatsRecord {
  playerId: string;
  raids: number;
  successfulExtractions: number;
  deaths: number;
  playerKills: number;
  aiKills: number;
  lootExtractedValue: number;
  damageDealt: number;
  playtimeSeconds: number;
}

export interface InventoryRow {
  id: string;
  playerId: string;
  container: InventoryContainer;
  itemId: string;
  quantity: number;
  gridX: number;
  gridY: number;
  rotated: boolean;
  ammoInMag: number | null;
  durability: number | null;
}

export interface LoadoutRecord {
  id: string;
  playerId: string;
  name: string;
  primaryWeaponId: string | null;
  secondaryWeaponId: string | null;
  armorItemId: string | null;
  perkIds: string[];
}

export interface LoadoutPatch {
  name?: string;
  primaryWeaponId?: string | null;
  secondaryWeaponId?: string | null;
  armorItemId?: string | null;
  perkIds?: string[];
}

/** What the game server receives when a player deploys. */
export interface DeployManifest {
  loadoutId: string | null;
  primaryWeaponId: string | null;
  secondaryWeaponId: string | null;
  armorItemId: string | null;
  perkIds: string[];
  backpack: { itemId: string; quantity: number; x: number; y: number; rotated: boolean }[];
  secure: { itemId: string; quantity: number; x: number; y: number; rotated: boolean }[];
}

export interface RaidLootLineRecord {
  itemId: string;
  quantity: number;
  value: number;
  extracted: boolean;
}

export interface SurvivingStack {
  itemId: string;
  quantity: number;
  ammoInMag?: number | null;
  durability?: number | null;
}

export interface MissionProgressPatch {
  missionId: string;
  progress: number;
  completed: boolean;
  daily: boolean;
  resetKey: string | null;
}

export interface FinalizeRaidPayload {
  result: RaidResult;
  survivalSeconds: number;
  playerKills: number;
  aiKills: number;
  damageDealt: number;
  xpEarned: number;
  lootValue: number;
  loot: RaidLootLineRecord[];
  /** Items that survived and are written to the permanent stash. */
  stash: SurvivingStack[];
  missions: MissionProgressPatch[];
}

export interface FinalizeRaidResult {
  raidId: string;
  xpEarned: number;
  creditsEarned: number;
  levelBefore: number;
  levelAfter: number;
  xpTotal: number;
}

export interface RaidHistoryRecord {
  id: string;
  roomId: string;
  mapId: string;
  startedAt: string;
  endedAt: string | null;
  result: RaidResult | null;
  survivalSeconds: number;
  playerKills: number;
  aiKills: number;
  lootValue: number;
  xpEarned: number;
}

export interface MissionRow {
  id: string;
  missionId: string;
  progress: number;
  completed: boolean;
  claimedAt: string | null;
  daily: boolean;
  resetKey: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  level: number;
  lootExtractedValue: number;
  playerKills: number;
  successfulExtractions: number;
}

export interface MarketResult {
  ok: boolean;
  credits: number;
  totalPrice: number;
  reason?: string;
}

export interface SuspiciousEventRecord {
  playerId: string | null;
  roomId: string | null;
  kind: string;
  detail: string;
}

/**
 * The persistence port.
 *
 * Two adapters implement it: Supabase (production) and a file-backed store for
 * local development and demo mode. Gameplay code only ever sees this interface.
 */
export interface Persistence {
  readonly kind: 'supabase' | 'file';

  ensureProfile(userId: string, username: string): Promise<ProfileRecord>;
  getProfile(userId: string): Promise<ProfileRecord | null>;
  setTutorialDone(userId: string): Promise<void>;
  getStats(userId: string): Promise<StatsRecord>;

  listInventory(userId: string, container?: InventoryContainer): Promise<InventoryRow[]>;
  moveInventoryContainer(
    userId: string,
    entryId: string,
    container: InventoryContainer,
  ): Promise<void>;

  getActiveLoadout(userId: string): Promise<LoadoutRecord | null>;
  saveLoadout(userId: string, patch: LoadoutPatch): Promise<LoadoutRecord>;
  deployLoadout(userId: string, loadoutId: string | null): Promise<DeployManifest>;

  startRaid(userId: string, roomId: string, mapId: string): Promise<string>;
  finalizeRaid(
    userId: string,
    raidId: string,
    payload: FinalizeRaidPayload,
  ): Promise<FinalizeRaidResult>;
  listRaidHistory(userId: string, limit: number): Promise<RaidHistoryRecord[]>;

  marketBuy(userId: string, itemId: string, quantity: number): Promise<MarketResult>;
  marketSell(userId: string, entryId: string, quantity: number): Promise<MarketResult>;

  listMissions(userId: string): Promise<MissionRow[]>;
  ensureDailyMissions(userId: string, resetKey: string, poolIds: string[]): Promise<MissionRow[]>;
  claimMission(userId: string, playerMissionId: string): Promise<MarketResult>;

  leaderboard(metric: 'loot' | 'kills' | 'extracts', limit: number): Promise<LeaderboardEntry[]>;
  leaderboardRank(
    userId: string,
    metric: 'loot' | 'kills' | 'extracts',
  ): Promise<number | null>;

  logSuspicious(event: SuspiciousEventRecord): Promise<void>;
}
