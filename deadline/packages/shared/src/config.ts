/**
 * Central balance + tuning configuration.
 *
 * Nothing in gameplay code may hardcode a balance number: everything lives
 * here, and the server overlays environment variables on top at boot via
 * {@link resolveGameConfig}. The client receives the effective values from the
 * server in the room state so both sides agree on the rules.
 */

export interface GameConfig {
  /** Raid length in seconds. */
  readonly matchDurationSeconds: number;
  /** Seconds of raid time remaining when FINAL_PHASE (the "danger" phase) begins. */
  readonly finalPhaseSeconds: number;
  /** Seconds remaining when the alarm / red UI pulse kicks in. */
  readonly alarmSeconds: number;
  /** Lobby countdown before spawn, in seconds. */
  readonly countdownSeconds: number;
  /** Maximum human players per raid. */
  readonly maxPlayers: number;
  /** Minimum humans required before COUNTDOWN starts. */
  readonly minPlayersToStart: number;
  /** Seconds a lobby waits for more humans before filling with bots. */
  readonly lobbyFillSeconds: number;
  /** Authoritative simulation frequency in Hz. */
  readonly serverTickRate: number;
  /** World-state broadcast frequency in Hz. */
  readonly snapshotRate: number;
  /** Seconds a player must stand inside an extraction zone. */
  readonly extractionTimeSeconds: number;
  /** Credits granted to a brand-new profile. */
  readonly startingCredits: number;
  /** Number of AI Raider bots used to backfill a lobby. */
  readonly botCount: number;
  /** Multiplier applied to the number of loot items rolled per container. */
  readonly lootMultiplier: number;
  /** Multiplier applied to all XP rewards. */
  readonly xpMultiplier: number;
  /** Seconds a disconnected player's body stays in the world awaiting reconnect. */
  readonly disconnectGraceSeconds: number;
  /** Fraction of item value a vendor pays when buying from the player. */
  readonly vendorSellRatio: number;
  /** Seconds into the raid at which the supply drop is announced. */
  readonly supplyDropAtSeconds: number;
  /** Seconds between the announcement and the crate becoming lootable. */
  readonly supplyDropTravelSeconds: number;
  /** Whether bots are allowed to backfill. */
  readonly enableBots: boolean;
  /** Number of extraction points assigned to each player at deploy. */
  readonly extractionsPerPlayer: number;
  /** Maximum AI enemies alive in a raid at once. */
  readonly maxAIEnemies: number;
  /** Allow legendary items to be stored in the secure container. */
  readonly allowLegendaryInSecure: boolean;
  /** Perks a player may equip. */
  readonly perkSlots: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  matchDurationSeconds: 600,
  finalPhaseSeconds: 120,
  alarmSeconds: 60,
  countdownSeconds: 5,
  maxPlayers: 8,
  minPlayersToStart: 1,
  lobbyFillSeconds: 15,
  serverTickRate: 25,
  snapshotRate: 20,
  extractionTimeSeconds: 5,
  startingCredits: 10_000,
  botCount: 4,
  lootMultiplier: 1,
  xpMultiplier: 1,
  disconnectGraceSeconds: 30,
  vendorSellRatio: 0.55,
  supplyDropAtSeconds: 300,
  supplyDropTravelSeconds: 20,
  enableBots: true,
  extractionsPerPlayer: 2,
  maxAIEnemies: 26,
  allowLegendaryInSecure: true,
  perkSlots: 2,
};

/** Movement + combat tuning that both the client predictor and the server use. */
export const MOVEMENT = {
  walkSpeed: 4.2,
  sprintSpeed: 7.4,
  crouchSpeed: 2.1,
  adsSpeedMultiplier: 0.55,
  acceleration: 46,
  friction: 11,
  playerRadius: 0.42,
  playerHeight: 1.8,
  crouchHeight: 1.15,
  /** Stamina drained per second of sprinting. */
  staminaDrainPerSecond: 14,
  /** Stamina restored per second once regeneration starts. */
  staminaRegenPerSecond: 11,
  /** Seconds without sprinting before stamina regenerates. */
  staminaRegenDelay: 1.6,
  /** Minimum stamina required to begin a sprint. */
  minStaminaToSprint: 8,
  maxStamina: 100,
  /** Tolerance (metres) for the server's impossible-movement check. */
  antiCheatPositionTolerance: 1.35,
  /** Vertical eye offset used for hitscan origins and AI line-of-sight. */
  eyeHeight: 1.55,
} as const;

export const COMBAT = {
  /** Base health of every player. */
  baseHealth: 100,
  maxArmor: 100,
  /** Fraction of incoming damage absorbed by a fully intact armour plate. */
  armorDamageReduction: 0.55,
  /** Fraction of absorbed damage that degrades the armour itself. */
  armorDurabilityLossRatio: 0.65,
  headshotMultiplier: 2.1,
  limbMultiplier: 0.8,
  /** Metres beyond a weapon's effective range before damage starts to drop. */
  falloffStartRatio: 1,
  /** Damage retained at twice the effective range. */
  falloffMinMultiplier: 0.45,
  /** Maximum hitscan travel distance. */
  maxRaycastDistance: 220,
  /** Grace factor applied to the fire-rate validator to tolerate jitter. */
  fireRateToleranceMs: 25,
  /** Maximum metres between a player and an interactable for the action to be valid. */
  interactionRange: 2.6,
  /** Seconds a corpse stays lootable. */
  corpseLifetimeSeconds: 240,
} as const;

export const INVENTORY = {
  backpackWidth: 8,
  backpackHeight: 6,
  secureWidth: 2,
  secureHeight: 2,
  stashWidth: 10,
  stashHeight: 10,
} as const;

export const XP_REWARDS = {
  extraction: 500,
  playerKill: 300,
  aiKill: 75,
  /** XP granted per 100 credits of extracted loot value. */
  lootValuePer100: 4,
  survivalPerMinute: 25,
} as const;

export type EnvSource = Readonly<Record<string, string | undefined>>;

function envNumber(env: EnvSource, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(env: EnvSource, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/** Build the effective {@link GameConfig} from defaults + environment overrides. */
export function resolveGameConfig(env: EnvSource = {}): GameConfig {
  const d = DEFAULT_GAME_CONFIG;
  return {
    matchDurationSeconds: envNumber(env, 'MATCH_DURATION_SECONDS', d.matchDurationSeconds),
    finalPhaseSeconds: envNumber(env, 'FINAL_PHASE_SECONDS', d.finalPhaseSeconds),
    alarmSeconds: envNumber(env, 'ALARM_SECONDS', d.alarmSeconds),
    countdownSeconds: envNumber(env, 'COUNTDOWN_SECONDS', d.countdownSeconds),
    maxPlayers: envNumber(env, 'MAX_PLAYERS', d.maxPlayers),
    minPlayersToStart: envNumber(env, 'MIN_PLAYERS_TO_START', d.minPlayersToStart),
    lobbyFillSeconds: envNumber(env, 'LOBBY_FILL_SECONDS', d.lobbyFillSeconds),
    serverTickRate: envNumber(env, 'SERVER_TICK_RATE', d.serverTickRate),
    snapshotRate: envNumber(env, 'SNAPSHOT_RATE', d.snapshotRate),
    extractionTimeSeconds: envNumber(env, 'EXTRACTION_TIME_SECONDS', d.extractionTimeSeconds),
    startingCredits: envNumber(env, 'STARTING_CREDITS', d.startingCredits),
    botCount: envNumber(env, 'BOT_COUNT', d.botCount),
    lootMultiplier: envNumber(env, 'LOOT_MULTIPLIER', d.lootMultiplier),
    xpMultiplier: envNumber(env, 'XP_MULTIPLIER', d.xpMultiplier),
    disconnectGraceSeconds: envNumber(env, 'DISCONNECT_GRACE_SECONDS', d.disconnectGraceSeconds),
    vendorSellRatio: envNumber(env, 'VENDOR_SELL_RATIO', d.vendorSellRatio),
    supplyDropAtSeconds: envNumber(env, 'SUPPLY_DROP_AT_SECONDS', d.supplyDropAtSeconds),
    supplyDropTravelSeconds: envNumber(
      env,
      'SUPPLY_DROP_TRAVEL_SECONDS',
      d.supplyDropTravelSeconds,
    ),
    enableBots: envBool(env, 'ENABLE_BOTS', d.enableBots),
    extractionsPerPlayer: envNumber(env, 'EXTRACTIONS_PER_PLAYER', d.extractionsPerPlayer),
    maxAIEnemies: envNumber(env, 'MAX_AI_ENEMIES', d.maxAIEnemies),
    allowLegendaryInSecure: envBool(
      env,
      'ALLOW_LEGENDARY_IN_SECURE',
      d.allowLegendaryInSecure,
    ),
    perkSlots: envNumber(env, 'PERK_SLOTS', d.perkSlots),
  };
}
