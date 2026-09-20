import {
  AmmoType,
  COMBAT,
  ItemCategory,
  MOVEMENT,
  PlayerRaidState,
  aggregatePerks,
  getItem,
  getWeaponDefinition,
  requireWeaponDefinition,
  type ItemDefinition,
  type PerkModifiers,
  type WeaponDefinition,
} from '@deadline/shared';
import { GridInventory, createMovementState, type MovementState } from '@deadline/game-core';
import type { DeployManifest, MissionRow } from '@deadline/persistence';
import type { PlayerState } from './state.js';

export interface WeaponRuntime {
  readonly definition: WeaponDefinition;
  ammoInMag: number;
}

export type WeaponSlot = 'primary' | 'secondary';

/**
 * Everything the server knows about a player in a raid that is *not* part of
 * the replicated state. Inventory contents, assigned extractions, fire timing
 * and anti-cheat counters stay here so a modified client cannot read them.
 */
export interface RaidPlayer {
  /** Reassigned on reconnect, so the same runtime object keeps serving the
   * player across a dropped socket. */
  sessionId: string;
  readonly userId: string;
  readonly username: string;
  readonly isBot: boolean;
  readonly schema: PlayerState;

  movement: MovementState;
  pitch: number;
  yaw: number;

  backpack: GridInventory;
  secure: GridInventory;
  /** Loose rounds by ammo type — picking ammo up converts it immediately. */
  reserveAmmo: Map<string, number>;

  weapons: Partial<Record<WeaponSlot, WeaponRuntime>>;
  activeSlot: WeaponSlot;
  perks: PerkModifiers;
  armorItemId: string | null;

  assignedExtractions: string[];
  extraction: { pointId: string; elapsed: number } | null;

  /** Server clock (ms) of the last shot, for fire-rate validation. */
  lastShotAt: number;
  consecutiveShots: number;
  reloadEndsAt: number;
  healEndsAt: number;
  healEntryId: string | null;

  lastInputSeq: number;
  lastInputAt: number;
  /** Anti-cheat: consecutive suspicious movement frames. */
  movementStrikes: number;

  raidId: string | null;
  deployedAt: number;
  visitedPois: Set<string>;
  missions: MissionRow[];
  /** Set once the raid has been written to the database. */
  resolved: boolean;
  disconnectedAt: number | null;
  /** Lootable corpse this player left behind, if any. */
  corpseContainerId: string | null;
}

export interface CreatePlayerParams {
  sessionId: string;
  userId: string;
  username: string;
  isBot: boolean;
  schema: PlayerState;
  manifest: DeployManifest;
  missions: MissionRow[];
  spawnX: number;
  spawnZ: number;
  spawnRotation: number;
}

export function createRaidPlayer(params: CreatePlayerParams): RaidPlayer {
  const perks = aggregatePerks(params.manifest.perkIds);
  const backpack = GridInventory.backpack();
  const secure = GridInventory.secure();
  const reserveAmmo = new Map<string, number>();

  const weapons: Partial<Record<WeaponSlot, WeaponRuntime>> = {};
  const primary = params.manifest.primaryWeaponId
    ? getWeaponDefinition(params.manifest.primaryWeaponId)
    : undefined;
  const secondary = params.manifest.secondaryWeaponId
    ? getWeaponDefinition(params.manifest.secondaryWeaponId)
    : undefined;
  if (primary) weapons.primary = { definition: primary, ammoInMag: primary.magazineSize };
  if (secondary) weapons.secondary = { definition: secondary, ammoInMag: secondary.magazineSize };

  // Two spare magazines for whatever the player brought.
  for (const weapon of [primary, secondary]) {
    if (!weapon) continue;
    addReserveAmmo(reserveAmmo, weapon.ammoType, weapon.magazineSize * 2);
  }

  for (const entry of params.manifest.backpack) {
    const definition = getItem(entry.itemId);
    if (!definition) continue;
    if (isAmmoItem(definition)) {
      addReserveAmmo(
        reserveAmmo,
        definition.id,
        (definition.roundsPerUnit ?? 30) * entry.quantity,
      );
      continue;
    }
    backpack.addItem(entry.itemId, entry.quantity);
  }
  for (const entry of params.manifest.secure) {
    secure.addItem(entry.itemId, entry.quantity);
  }

  const armorDefinition = params.manifest.armorItemId
    ? getItem(params.manifest.armorItemId)
    : undefined;
  const armor = Math.min(
    COMBAT.maxArmor,
    (armorDefinition?.armorPoints ?? 0) + perks.startingArmorBonus,
  );

  const activeSlot: WeaponSlot = weapons.primary ? 'primary' : 'secondary';
  const active = weapons[activeSlot];

  const schema = params.schema;
  schema.sessionId = params.sessionId;
  schema.userId = params.userId;
  schema.username = params.username;
  schema.isBot = params.isBot;
  schema.x = params.spawnX;
  schema.y = 0;
  schema.z = params.spawnZ;
  schema.rotationY = params.spawnRotation;
  schema.health = COMBAT.baseHealth;
  schema.armor = armor;
  schema.stamina = MOVEMENT.maxStamina;
  schema.raidState = PlayerRaidState.Deploying;
  schema.currentWeaponId = active?.definition.id ?? '';
  schema.ammoInMag = active?.ammoInMag ?? 0;
  schema.reserveAmmo = active ? (reserveAmmo.get(active.definition.ammoType) ?? 0) : 0;

  return {
    sessionId: params.sessionId,
    userId: params.userId,
    username: params.username,
    isBot: params.isBot,
    schema,
    movement: createMovementState(params.spawnX, params.spawnZ),
    pitch: 0,
    yaw: params.spawnRotation,
    backpack,
    secure,
    reserveAmmo,
    weapons,
    activeSlot,
    perks,
    armorItemId: params.manifest.armorItemId,
    assignedExtractions: [],
    extraction: null,
    lastShotAt: 0,
    consecutiveShots: 0,
    reloadEndsAt: 0,
    healEndsAt: 0,
    healEntryId: null,
    lastInputSeq: 0,
    lastInputAt: Date.now(),
    movementStrikes: 0,
    raidId: null,
    deployedAt: Date.now(),
    visitedPois: new Set<string>(),
    missions: params.missions,
    resolved: false,
    disconnectedAt: null,
    corpseContainerId: null,
  };
}

export function isAmmoItem(definition: ItemDefinition): boolean {
  return definition.category === ItemCategory.Ammo;
}

export function addReserveAmmo(
  reserve: Map<string, number>,
  ammoType: string,
  rounds: number,
): void {
  reserve.set(ammoType, Math.min(999, (reserve.get(ammoType) ?? 0) + rounds));
}

export function activeWeapon(player: RaidPlayer): WeaponRuntime | undefined {
  return player.weapons[player.activeSlot];
}

/** Keeps the replicated weapon/ammo fields in sync with the runtime state. */
export function syncWeaponState(player: RaidPlayer): void {
  const weapon = activeWeapon(player);
  player.schema.currentWeaponId = weapon?.definition.id ?? '';
  player.schema.ammoInMag = weapon?.ammoInMag ?? 0;
  player.schema.reserveAmmo = weapon
    ? (player.reserveAmmo.get(weapon.definition.ammoType) ?? 0)
    : 0;
}

/** Rounds available to top up the current magazine. */
export function reserveFor(player: RaidPlayer, weapon: WeaponRuntime): number {
  return player.reserveAmmo.get(weapon.definition.ammoType) ?? 0;
}

export function consumeReserve(player: RaidPlayer, weapon: WeaponRuntime, rounds: number): number {
  const available = reserveFor(player, weapon);
  const taken = Math.min(available, rounds);
  player.reserveAmmo.set(weapon.definition.ammoType, available - taken);
  return taken;
}

export function isAlive(player: RaidPlayer): boolean {
  return (
    player.schema.raidState === PlayerRaidState.Alive ||
    player.schema.raidState === PlayerRaidState.Extracting
  );
}

/** Weapons default to a sidearm when a player deploys with nothing. */
export function ensureFallbackWeapon(player: RaidPlayer): void {
  if (player.weapons.primary || player.weapons.secondary) return;
  const fallback = requireWeaponDefinition('pm9');
  player.weapons.primary = { definition: fallback, ammoInMag: fallback.magazineSize };
  player.activeSlot = 'primary';
  addReserveAmmo(player.reserveAmmo, AmmoType.Light, fallback.magazineSize);
  syncWeaponState(player);
}
