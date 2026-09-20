import {
  COMBAT,
  ContainerType,
  Rarity,
  ServerMessage,
  distance2D,
  getItem,
  hashString,
  makeRng,
  type ContainerOpenedPayload,
  type GameConfig,
  type LootPickedPayload,
  type MapDefinition,
  type Vec3,
} from '@deadline/shared';
import {
  findClearPosition,
  rollAILoot,
  rollContainer,
  type CollisionWorld,
  type LootRollEntry,
} from '@deadline/game-core';
import { ContainerState } from '../rooms/state.js';
import type { RaidPlayer } from '../rooms/raidPlayer.js';
import { addReserveAmmo, isAmmoItem } from '../rooms/raidPlayer.js';
import { log } from '../logger.js';

export interface WorldItem {
  id: string;
  itemId: string;
  quantity: number;
}

export interface RuntimeContainer {
  readonly id: string;
  readonly containerType: ContainerType;
  readonly position: Vec3;
  readonly poiId: string;
  readonly lockedRoomId: string | null;
  readonly schema: ContainerState;
  /** Rolled lazily the first time somebody opens it. */
  items: WorldItem[];
  rolled: boolean;
}

export interface LootSystemHost {
  readonly roomId: string;
  readonly config: GameConfig;
  readonly map: MapDefinition;
  readonly world: CollisionWorld;
  readonly seed: number;
  addContainerToState(container: ContainerState): void;
  removeContainerFromState(id: string): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  broadcast(type: string, payload: unknown): void;
  announce(text: string, tone: 'info' | 'warning' | 'danger'): void;
}

/**
 * Owns every lootable thing in the raid: static containers from the map,
 * corpses, and the supply drop.
 *
 * All rolls happen here, on the server. Contents are never present in the
 * replicated state — a client only learns what is inside a container after it
 * legitimately opens it, and only then by a targeted message.
 */
export class LootSystem {
  private readonly host: LootSystemHost;
  private readonly containers = new Map<string, RuntimeContainer>();
  private corpseCounter = 0;
  private supplyDropSpawned = false;
  private supplyDropAnnounced = false;
  private supplyDropTarget: { x: number; z: number; poiName: string } | null = null;

  constructor(host: LootSystemHost) {
    this.host = host;
  }

  /** Create the static containers described by the map. */
  spawnMapContainers(): void {
    for (const spawn of this.host.map.lootSpawns) {
      const schema = new ContainerState();
      schema.id = spawn.id;
      schema.containerType = spawn.containerType;
      schema.x = spawn.position.x;
      schema.y = spawn.position.y;
      schema.z = spawn.position.z;
      schema.rotationY = spawn.rotationY;
      schema.lockedRoomId = spawn.lockedRoomId ?? '';
      schema.poiId = spawn.poiId;
      this.containers.set(spawn.id, {
        id: spawn.id,
        containerType: spawn.containerType,
        position: spawn.position,
        poiId: spawn.poiId,
        lockedRoomId: spawn.lockedRoomId ?? null,
        schema,
        items: [],
        rolled: false,
      });
      this.host.addContainerToState(schema);
    }
    log.info('loot.containers_spawned', {
      roomId: this.host.roomId,
      count: this.containers.size,
    });
  }

  get(containerId: string): RuntimeContainer | undefined {
    return this.containers.get(containerId);
  }

  all(): RuntimeContainer[] {
    return [...this.containers.values()];
  }

  /**
   * Handle an interact request. Returns an error reason, or null on success.
   * Validates distance, lock state and player liveness — the client's claim
   * that it is "near" a container is never taken at face value.
   */
  open(player: RaidPlayer, containerId: string): string | null {
    const container = this.containers.get(containerId);
    if (!container) return 'unknown_container';

    const playerPosition = { x: player.schema.x, y: player.schema.y, z: player.schema.z };
    if (distance2D(playerPosition, container.position) > COMBAT.interactionRange + 0.6) {
      return 'out_of_range';
    }

    if (container.lockedRoomId) {
      const room = this.host.map.lockedRooms.find((entry) => entry.id === container.lockedRoomId);
      if (room && !player.backpack.has(room.keyItemId) && !player.secure.has(room.keyItemId)) {
        return 'locked';
      }
    }

    if (!container.rolled) {
      container.items = this.roll(container);
      container.rolled = true;
    }

    container.schema.opened = true;
    container.schema.empty = container.items.length === 0;

    const payload: ContainerOpenedPayload = {
      containerId: container.id,
      items: container.items.map((item) => ({
        worldItemId: item.id,
        itemId: item.itemId,
        quantity: item.quantity,
      })),
    };
    this.host.sendTo(player.sessionId, ServerMessage.ContainerOpened, payload);
    return null;
  }

  /**
   * Move one stack from a container into the player's backpack (or secure
   * container). Ownership, range and capacity are all re-checked here.
   */
  pickup(
    player: RaidPlayer,
    containerId: string,
    worldItemId: string,
    target: 'backpack' | 'secure',
    cell?: { x: number; y: number; rotated: boolean },
  ): string | null {
    const container = this.containers.get(containerId);
    if (!container) return 'unknown_container';
    if (!container.rolled || !container.schema.opened) return 'not_opened';

    const playerPosition = { x: player.schema.x, y: player.schema.y, z: player.schema.z };
    if (distance2D(playerPosition, container.position) > COMBAT.interactionRange + 0.6) {
      return 'out_of_range';
    }

    const index = container.items.findIndex((item) => item.id === worldItemId);
    if (index === -1) return 'already_taken';
    const item = container.items[index]!;
    const definition = getItem(item.itemId);
    if (!definition) return 'unknown_item';

    // Ammo is converted straight into loose rounds instead of taking a slot.
    if (isAmmoItem(definition) && target === 'backpack') {
      addReserveAmmo(
        player.reserveAmmo,
        definition.id,
        (definition.roundsPerUnit ?? 30) * item.quantity,
      );
      container.items.splice(index, 1);
      this.afterPickup(container, player, item);
      return null;
    }

    const inventory = target === 'secure' ? player.secure : player.backpack;
    if (
      target === 'secure' &&
      definition.rarity === Rarity.Legendary &&
      !this.host.config.allowLegendaryInSecure
    ) {
      return 'legendary_not_allowed';
    }

    const result = cell
      ? inventory.addEntryAt(
          {
            id: `${worldItemId}`,
            itemId: item.itemId,
            quantity: item.quantity,
            x: cell.x,
            y: cell.y,
            rotated: cell.rotated,
          },
          cell.x,
          cell.y,
          cell.rotated,
        )
      : inventory.addItem(item.itemId, item.quantity);

    if (!result.ok) return result.reason ?? 'no_space';

    container.items.splice(index, 1);
    this.afterPickup(container, player, item);
    return null;
  }

  private afterPickup(container: RuntimeContainer, player: RaidPlayer, item: WorldItem): void {
    container.schema.empty = container.items.length === 0;
    const payload: LootPickedPayload = {
      containerId: container.id,
      worldItemId: item.id,
      itemId: item.itemId,
      quantity: item.quantity,
      byPlayerId: player.sessionId,
    };
    this.host.broadcast(ServerMessage.LootPicked, payload);
  }

  /** Drop a stack from the backpack onto the ground as a one-off container. */
  drop(player: RaidPlayer, entryId: string): string | null {
    const entry = player.backpack.get(entryId);
    if (!entry) return 'not_found';
    player.backpack.remove(entryId);
    this.createContainer({
      containerType: ContainerType.CivilianCrate,
      position: { x: player.schema.x, y: 0, z: player.schema.z },
      poiId: 'dropped',
      items: [{ itemId: entry.itemId, quantity: entry.quantity }],
      openedByDefault: true,
      ownerName: player.username,
    });
    return null;
  }

  /** Leaves a lootable body where a player died. */
  createCorpse(player: RaidPlayer): string {
    const items = player.backpack.list().map((entry) => ({
      itemId: entry.itemId,
      quantity: entry.quantity,
    }));
    // The player's carried weapon drops too — killing someone should pay out.
    const weapon = player.weapons[player.activeSlot];
    if (weapon) items.push({ itemId: weapon.definition.id, quantity: 1 });

    return this.createContainer({
      containerType: ContainerType.Corpse,
      position: { x: player.schema.x, y: 0, z: player.schema.z },
      poiId: 'corpse',
      items,
      openedByDefault: true,
      ownerName: player.username,
    });
  }

  /** Drops an AI enemy's loot where it fell. */
  createAIDrop(archetype: string, position: Vec3, seedKey: string): string | null {
    const rng = makeRng(hashString(`${this.host.seed}:${seedKey}`));
    const entries = rollAILoot(archetype, rng, { lootMultiplier: this.host.config.lootMultiplier });
    if (entries.length === 0) return null;
    return this.createContainer({
      containerType: ContainerType.Corpse,
      position,
      poiId: 'corpse',
      items: entries,
      openedByDefault: true,
      ownerName: archetype,
    });
  }

  createContainer(params: {
    containerType: ContainerType;
    position: Vec3;
    poiId: string;
    items: LootRollEntry[];
    openedByDefault: boolean;
    ownerName?: string;
    lockedRoomId?: string | null;
  }): string {
    this.corpseCounter += 1;
    const id = `dyn_${this.corpseCounter}`;
    const schema = new ContainerState();
    schema.id = id;
    schema.containerType = params.containerType;
    schema.x = params.position.x;
    schema.y = params.position.y;
    schema.z = params.position.z;
    schema.rotationY = 0;
    schema.opened = params.openedByDefault;
    schema.lockedRoomId = params.lockedRoomId ?? '';
    schema.poiId = params.poiId;
    schema.ownerName = params.ownerName ?? '';

    const items: WorldItem[] = params.items.map((entry, index) => ({
      id: `${id}_i${index}`,
      itemId: entry.itemId,
      quantity: entry.quantity,
    }));
    schema.empty = items.length === 0;

    this.containers.set(id, {
      id,
      containerType: params.containerType,
      position: params.position,
      poiId: params.poiId,
      lockedRoomId: params.lockedRoomId ?? null,
      schema,
      items,
      rolled: true,
    });
    this.host.addContainerToState(schema);
    return id;
  }

  /**
   * Announce and then land the mid-raid supply drop — a deliberate PvP hotspot.
   */
  updateSupplyDrop(elapsed: number): void {
    const config = this.host.config;
    if (this.supplyDropSpawned) return;

    if (!this.supplyDropAnnounced && elapsed >= config.supplyDropAtSeconds) {
      const zones = this.host.map.supplyDropZones;
      if (zones.length === 0) {
        this.supplyDropSpawned = true;
        return;
      }
      const rng = makeRng(hashString(`${this.host.seed}:supply_drop`));
      const zone = rng.pick(zones);
      const poi = this.host.map.pois.find((entry) => entry.id === zone.poiId);
      // The jittered district centre can land inside a building; a crate
      // nobody can reach is worse than no crate at all.
      const landing = findClearPosition(
        this.host.world,
        zone.position.x + rng.float(-14, 14),
        zone.position.z + rng.float(-14, 14),
        1.6,
      );
      this.supplyDropTarget = {
        x: landing.x,
        z: landing.z,
        poiName: poi?.name ?? zone.poiId,
      };
      this.supplyDropAnnounced = true;
      this.host.announce(`SUPPLY DROP INBOUND — ${this.supplyDropTarget.poiName}`, 'warning');
      this.host.broadcast(ServerMessage.SupplyDrop, {
        containerId: null,
        x: this.supplyDropTarget.x,
        z: this.supplyDropTarget.z,
        poiName: this.supplyDropTarget.poiName,
        state: 'inbound',
      });
      return;
    }

    if (
      this.supplyDropAnnounced &&
      this.supplyDropTarget &&
      elapsed >= config.supplyDropAtSeconds + config.supplyDropTravelSeconds
    ) {
      const containerId = this.createContainer({
        containerType: ContainerType.SupplyDrop,
        position: { x: this.supplyDropTarget.x, y: 0, z: this.supplyDropTarget.z },
        poiId: 'supply_drop',
        items: rollContainer(
          ContainerType.SupplyDrop,
          makeRng(hashString(`${this.host.seed}:supply_drop_items`)),
          { lootMultiplier: this.host.config.lootMultiplier },
        ),
        openedByDefault: false,
      });
      this.supplyDropSpawned = true;
      this.host.announce(`SUPPLY DROP LANDED — ${this.supplyDropTarget.poiName}`, 'danger');
      this.host.broadcast(ServerMessage.SupplyDrop, {
        containerId,
        x: this.supplyDropTarget.x,
        z: this.supplyDropTarget.z,
        poiName: this.supplyDropTarget.poiName,
        state: 'landed',
      });
    }
  }

  private roll(container: RuntimeContainer): WorldItem[] {
    const poi = this.host.map.pois.find((entry) => entry.id === container.poiId);
    const rng = makeRng(hashString(`${this.host.seed}:${container.id}`));
    const entries = rollContainer(container.containerType, rng, {
      ...(poi ? { risk: poi.risk } : {}),
      lootMultiplier: this.host.config.lootMultiplier,
    });
    return entries.map((entry, index) => ({
      id: `${container.id}_i${index}`,
      itemId: entry.itemId,
      quantity: entry.quantity,
    }));
  }
}
