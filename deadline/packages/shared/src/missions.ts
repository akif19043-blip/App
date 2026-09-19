import { MissionType } from './enums.js';

/**
 * Data-driven mission definitions. A mission is a `type` plus a `target`
 * amount and optional `params`; the progress evaluator in `@deadline/game-core`
 * reads only those fields, so new missions require no gameplay code.
 */
export interface MissionDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: MissionType;
  readonly target: number;
  readonly xpReward: number;
  readonly creditReward: number;
  readonly requiredLevel: number;
  /** Mission must be completed in one raid rather than accumulating. */
  readonly singleRaid: boolean;
  readonly params?: MissionParams;
  /** Mission ids that must be completed first. */
  readonly requires?: readonly string[];
}

export interface MissionParams {
  /** For CollectItem: the item that must be extracted. */
  readonly itemId?: string;
  /** For VisitLocation: the POI id that must be entered. */
  readonly poiId?: string;
  /** For LootValue: loot must be extracted, not merely picked up. */
  readonly mustExtract?: boolean;
}

export const MISSION_DEFINITIONS: readonly MissionDefinition[] = [
  {
    id: 'first_run',
    name: 'FIRST RUN',
    description: 'Extract successfully once.',
    type: MissionType.Extract,
    target: 1,
    xpReward: 500,
    creditReward: 2_500,
    requiredLevel: 1,
    singleRaid: false,
  },
  {
    id: 'cleanup',
    name: 'CLEANUP',
    description: 'Kill 5 AI enemies.',
    type: MissionType.KillAI,
    target: 5,
    xpReward: 600,
    creditReward: 3_000,
    requiredLevel: 1,
    singleRaid: false,
  },
  {
    id: 'scavenger_run',
    name: 'SCAVENGER',
    description: 'Extract with loot worth 5,000 credits.',
    type: MissionType.LootValue,
    target: 5_000,
    xpReward: 900,
    creditReward: 4_000,
    requiredLevel: 1,
    singleRaid: true,
    params: { mustExtract: true },
    requires: ['first_run'],
  },
  {
    id: 'high_value_target',
    name: 'HIGH VALUE TARGET',
    description: 'Kill 1 player.',
    type: MissionType.KillPlayers,
    target: 1,
    xpReward: 1_200,
    creditReward: 5_000,
    requiredLevel: 2,
    singleRaid: false,
  },
  {
    id: 'recovery',
    name: 'RECOVERY',
    description: 'Extract with an Encrypted Drive.',
    type: MissionType.CollectItem,
    target: 1,
    xpReward: 2_500,
    creditReward: 9_000,
    requiredLevel: 3,
    singleRaid: true,
    params: { itemId: 'encrypted_drive' },
    requires: ['scavenger_run'],
  },
  {
    id: 'deep_sweep',
    name: 'DEEP SWEEP',
    description: 'Reach the Underground Bunker and extract afterwards.',
    type: MissionType.VisitLocation,
    target: 1,
    xpReward: 1_800,
    creditReward: 7_500,
    requiredLevel: 4,
    singleRaid: true,
    params: { poiId: 'bunker', mustExtract: true },
  },
];

const MISSION_INDEX = new Map(MISSION_DEFINITIONS.map((mission) => [mission.id, mission]));

export function getMission(id: string): MissionDefinition | undefined {
  return MISSION_INDEX.get(id);
}

/** Pool that the daily-mission generator draws from. */
export const DAILY_MISSION_POOL: readonly MissionDefinition[] = [
  {
    id: 'daily_kill_ai_10',
    name: 'PEST CONTROL',
    description: 'Kill 10 AI enemies.',
    type: MissionType.KillAI,
    target: 10,
    xpReward: 800,
    creditReward: 4_000,
    requiredLevel: 1,
    singleRaid: false,
  },
  {
    id: 'daily_extract_2',
    name: 'DOUBLE OUT',
    description: 'Extract twice.',
    type: MissionType.Extract,
    target: 2,
    xpReward: 900,
    creditReward: 4_500,
    requiredLevel: 1,
    singleRaid: false,
  },
  {
    id: 'daily_loot_15k',
    name: 'HAUL',
    description: 'Extract with 15,000 credits of loot.',
    type: MissionType.LootValue,
    target: 15_000,
    xpReward: 1_400,
    creditReward: 6_000,
    requiredLevel: 1,
    singleRaid: false,
    params: { mustExtract: true },
  },
  {
    id: 'daily_kill_player_1',
    name: 'CONTESTED',
    description: 'Kill 1 player.',
    type: MissionType.KillPlayers,
    target: 1,
    xpReward: 1_100,
    creditReward: 5_500,
    requiredLevel: 1,
    singleRaid: false,
  },
  {
    id: 'daily_visit_hospital',
    name: 'HOUSE CALL',
    description: 'Reach the Old Hospital.',
    type: MissionType.VisitLocation,
    target: 1,
    xpReward: 700,
    creditReward: 3_200,
    requiredLevel: 1,
    singleRaid: false,
    params: { poiId: 'hospital' },
  },
  {
    id: 'daily_visit_warehouse',
    name: 'FREIGHT RUN',
    description: 'Reach the Warehouse District.',
    type: MissionType.VisitLocation,
    target: 1,
    xpReward: 700,
    creditReward: 3_200,
    requiredLevel: 1,
    singleRaid: false,
    params: { poiId: 'warehouse' },
  },
  {
    id: 'daily_collect_battery',
    name: 'POWER SUPPLY',
    description: 'Extract with a Military Battery.',
    type: MissionType.CollectItem,
    target: 1,
    xpReward: 1_300,
    creditReward: 5_800,
    requiredLevel: 1,
    singleRaid: false,
    params: { itemId: 'military_battery' },
  },
];

export const DAILY_MISSION_COUNT = 3;

/** UTC date key (YYYY-MM-DD) that daily missions reset on. */
export function dailyResetKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const ALL_MISSIONS = new Map<string, MissionDefinition>([
  ...MISSION_DEFINITIONS.map((m) => [m.id, m] as const),
  ...DAILY_MISSION_POOL.map((m) => [m.id, m] as const),
]);

export function getAnyMission(id: string): MissionDefinition | undefined {
  return ALL_MISSIONS.get(id);
}
