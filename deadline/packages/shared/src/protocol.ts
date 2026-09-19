import { z } from 'zod';
import type { InventoryContainerKind, RaidPhase } from './enums.js';
import type { RaidSummary } from './types.js';
import type { Vec3 } from './math.js';

/**
 * Network protocol.
 *
 * Every client → server message is validated with zod on arrival. A message
 * that fails validation is dropped and logged as a suspicious event; the client
 * is never trusted to send damage, credits, XP or item grants.
 */

export const ClientMessage = {
  Input: 'input',
  Fire: 'fire',
  Reload: 'reload',
  Interact: 'interact',
  Pickup: 'pickup',
  Drop: 'drop',
  MoveItem: 'move_item',
  UseItem: 'use_item',
  Equip: 'equip',
  StartExtraction: 'start_extraction',
  CancelExtraction: 'cancel_extraction',
  Ping: 'ping',
  Ready: 'ready',
  DebugCommand: 'debug_command',
} as const;
export type ClientMessage = (typeof ClientMessage)[keyof typeof ClientMessage];

export const ServerMessage = {
  Welcome: 'welcome',
  Reconcile: 'reconcile',
  PlayerJoined: 'player_joined',
  PlayerLeft: 'player_left',
  ShotFired: 'shot_fired',
  DamageTaken: 'damage_taken',
  DamageDealt: 'damage_dealt',
  PlayerDied: 'player_died',
  AIDied: 'ai_died',
  ContainerOpened: 'container_opened',
  LootPicked: 'loot_picked',
  InventoryChanged: 'inventory_changed',
  ExtractionStarted: 'extraction_started',
  ExtractionCancelled: 'extraction_cancelled',
  ExtractionCompleted: 'extraction_completed',
  MatchTimer: 'match_timer',
  MatchPhase: 'match_phase',
  MatchEnded: 'match_ended',
  RaidSummaryReady: 'raid_summary',
  Announcement: 'announcement',
  SupplyDrop: 'supply_drop',
  Pong: 'pong',
  ActionRejected: 'action_rejected',
} as const;
export type ServerMessage = (typeof ServerMessage)[keyof typeof ServerMessage];

// ------------------------------------------------------ client → server schemas

const finite = z.number().finite();
const unitAxis = finite.min(-1).max(1);

/**
 * One simulation input frame. The client runs the same movement step locally
 * for prediction; the server re-runs it authoritatively and replies with a
 * reconcile packet when the positions diverge.
 */
export const InputMessageSchema = z.object({
  /** Monotonically increasing sequence number, used for reconciliation. */
  seq: z.number().int().nonnegative(),
  /** Frame delta in seconds. Clamped server side to defeat speed hacks. */
  dt: finite.min(0).max(0.25),
  /** Local movement axes in the player's own frame. */
  forward: unitAxis,
  right: unitAxis,
  yaw: finite,
  pitch: finite.min(-1.55).max(1.55),
  sprint: z.boolean(),
  crouch: z.boolean(),
  ads: z.boolean(),
  /** Position the client predicted after applying this input. */
  px: finite,
  py: finite,
  pz: finite,
});
export type InputMessage = z.infer<typeof InputMessageSchema>;

export const FireMessageSchema = z.object({
  seq: z.number().int().nonnegative(),
  yaw: finite,
  pitch: finite.min(-1.55).max(1.55),
  /** Client-side spread roll index — the server rolls its own; this is telemetry only. */
  shotId: z.number().int().nonnegative(),
});
export type FireMessage = z.infer<typeof FireMessageSchema>;

export const ReloadMessageSchema = z.object({});
export type ReloadMessage = z.infer<typeof ReloadMessageSchema>;

export const InteractMessageSchema = z.object({
  containerId: z.string().min(1).max(64),
});
export type InteractMessage = z.infer<typeof InteractMessageSchema>;

export const PickupMessageSchema = z.object({
  containerId: z.string().min(1).max(64),
  worldItemId: z.string().min(1).max(64),
  /** Target grid cell; when omitted the server auto-places the stack. */
  x: z.number().int().min(0).max(31).optional(),
  y: z.number().int().min(0).max(31).optional(),
  rotated: z.boolean().optional(),
  container: z.enum(['backpack', 'secure']).optional(),
});
export type PickupMessage = z.infer<typeof PickupMessageSchema>;

export const DropMessageSchema = z.object({
  entryId: z.string().min(1).max(64),
});
export type DropMessage = z.infer<typeof DropMessageSchema>;

export const MoveItemMessageSchema = z.object({
  entryId: z.string().min(1).max(64),
  toContainer: z.enum(['backpack', 'secure']),
  x: z.number().int().min(0).max(31),
  y: z.number().int().min(0).max(31),
  rotated: z.boolean(),
});
export type MoveItemMessage = z.infer<typeof MoveItemMessageSchema>;

export const UseItemMessageSchema = z.object({
  entryId: z.string().min(1).max(64),
});
export type UseItemMessage = z.infer<typeof UseItemMessageSchema>;

export const EquipMessageSchema = z.object({
  slot: z.enum(['primary', 'secondary']),
});
export type EquipMessage = z.infer<typeof EquipMessageSchema>;

export const StartExtractionMessageSchema = z.object({
  extractionPointId: z.string().min(1).max(64),
});
export type StartExtractionMessage = z.infer<typeof StartExtractionMessageSchema>;

export const PingMessageSchema = z.object({
  t: z.number().finite(),
});
export type PingMessage = z.infer<typeof PingMessageSchema>;

export const DebugCommandSchema = z.object({
  command: z.enum([
    'heal',
    'give_weapon',
    'spawn_loot',
    'spawn_enemy',
    'teleport',
    'set_timer',
    'kill_self',
    'toggle_ai_debug',
  ]),
  value: z.union([z.string().max(64), z.number().finite()]).optional(),
  x: finite.optional(),
  z: finite.optional(),
});
export type DebugCommand = z.infer<typeof DebugCommandSchema>;

/** Options sent with `client.joinOrCreate`. */
export const JoinOptionsSchema = z.object({
  accessToken: z.string().min(1).optional(),
  demoUserId: z.string().min(1).max(64).optional(),
  demoUsername: z.string().min(1).max(24).optional(),
  loadoutId: z.string().min(1).max(64).nullable().optional(),
  mapId: z.string().min(1).max(64).default('sector_zero'),
});
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

export const CLIENT_MESSAGE_SCHEMAS = {
  [ClientMessage.Input]: InputMessageSchema,
  [ClientMessage.Fire]: FireMessageSchema,
  [ClientMessage.Reload]: ReloadMessageSchema,
  [ClientMessage.Interact]: InteractMessageSchema,
  [ClientMessage.Pickup]: PickupMessageSchema,
  [ClientMessage.Drop]: DropMessageSchema,
  [ClientMessage.MoveItem]: MoveItemMessageSchema,
  [ClientMessage.UseItem]: UseItemMessageSchema,
  [ClientMessage.Equip]: EquipMessageSchema,
  [ClientMessage.StartExtraction]: StartExtractionMessageSchema,
  [ClientMessage.CancelExtraction]: z.object({}),
  [ClientMessage.Ping]: PingMessageSchema,
  [ClientMessage.Ready]: z.object({}),
  [ClientMessage.DebugCommand]: DebugCommandSchema,
} as const;

// ------------------------------------------------------ server → client payloads

export interface WelcomePayload {
  sessionId: string;
  userId: string;
  username: string;
  mapId: string;
  seed: number;
  assignedExtractions: string[];
  serverTickRate: number;
  matchDurationSeconds: number;
  extractionTimeSeconds: number;
  isBotFilled: boolean;
  debugEnabled: boolean;
}

/** Authoritative correction for a predicted frame. */
export interface ReconcilePayload {
  seq: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  stamina: number;
}

export interface ShotFiredPayload {
  shooterId: string;
  weaponId: string;
  origin: Vec3;
  /** One end point per pellet. */
  hits: { x: number; y: number; z: number; hit: boolean }[];
}

export interface DamageTakenPayload {
  amount: number;
  /** Direction the damage came from, in world space, for the HUD indicator. */
  fromX: number;
  fromZ: number;
  health: number;
  armor: number;
  attackerId: string | null;
  attackerName: string | null;
}

export interface DamageDealtPayload {
  targetId: string;
  amount: number;
  lethal: boolean;
  headshot: boolean;
  targetKind: 'player' | 'ai';
}

export interface PlayerDiedPayload {
  playerId: string;
  playerName: string;
  killerId: string | null;
  killerName: string | null;
  weaponId: string | null;
  corpseContainerId: string | null;
}

export interface AIDiedPayload {
  aiId: string;
  killerId: string | null;
  corpseContainerId: string | null;
}

export interface ContainerOpenedPayload {
  containerId: string;
  items: { worldItemId: string; itemId: string; quantity: number }[];
}

export interface LootPickedPayload {
  containerId: string;
  worldItemId: string;
  itemId: string;
  quantity: number;
  byPlayerId: string;
}

export interface InventoryChangedPayload {
  backpack: SerializedInventory;
  secure: SerializedInventory;
  reserveAmmo: Record<string, number>;
}

export interface SerializedInventory {
  kind: InventoryContainerKind;
  width: number;
  height: number;
  entries: {
    id: string;
    itemId: string;
    quantity: number;
    x: number;
    y: number;
    rotated: boolean;
    ammoInMag?: number;
    durability?: number;
  }[];
}

export interface ExtractionStatusPayload {
  playerId: string;
  extractionPointId: string;
  progress: number;
  remainingSeconds: number;
}

export interface MatchTimerPayload {
  phase: RaidPhase;
  timeRemaining: number;
  elapsed: number;
}

export interface MatchEndedPayload {
  reason: 'timer' | 'all_resolved';
}

export interface AnnouncementPayload {
  id: string;
  text: string;
  tone: 'info' | 'warning' | 'danger';
  durationMs: number;
}

export interface SupplyDropPayload {
  containerId: string | null;
  x: number;
  z: number;
  poiName: string;
  state: 'inbound' | 'landed';
}

export interface ActionRejectedPayload {
  action: string;
  reason: string;
}

export interface PongPayload {
  t: number;
  serverTime: number;
}

export type RaidSummaryPayload = RaidSummary;
