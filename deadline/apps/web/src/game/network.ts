import { Client, type Room } from 'colyseus.js';
import {
  ClientMessage,
  ServerMessage,
  type ActionRejectedPayload,
  type AnnouncementPayload,
  type ContainerOpenedPayload,
  type DamageDealtPayload,
  type DamageTakenPayload,
  type ExtractionStatusPayload,
  type InventoryChangedPayload,
  type LootPickedPayload,
  type MatchTimerPayload,
  type PlayerDiedPayload,
  type RaidSummary,
  type ReconcilePayload,
  type ShotFiredPayload,
  type SupplyDropPayload,
  type WelcomePayload,
} from '@deadline/shared';

/** Mirror of the server's replicated player schema, as the client reads it. */
export interface NetPlayer {
  sessionId: string;
  userId: string;
  username: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  pitch: number;
  vx: number;
  vz: number;
  health: number;
  armor: number;
  stamina: number;
  raidState: string;
  sprinting: boolean;
  crouching: boolean;
  ads: boolean;
  reloading: boolean;
  isBot: boolean;
  connected: boolean;
  currentWeaponId: string;
  ammoInMag: number;
  reserveAmmo: number;
  kills: number;
  aiKills: number;
  damageDealt: number;
  extractionProgress: number;
  extractionPointId: string;
  lastProcessedInput: number;
}

export interface NetAI {
  id: string;
  archetype: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  health: number;
  maxHealth: number;
  behaviour: string;
  alive: boolean;
}

export interface NetContainer {
  id: string;
  containerType: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  opened: boolean;
  empty: boolean;
  lockedRoomId: string;
  poiId: string;
  ownerName: string;
}

/**
 * The replicated state as the client sees it.
 *
 * The collections are optional on purpose: Colyseus hands back a state object
 * the moment the room resolves, but the maps only exist once the first patch
 * has been decoded. Treating them as always-present is how you get a
 * `Cannot read properties of undefined` on the first frame.
 */
export interface NetState {
  phase: string;
  mapId: string;
  seed: number;
  timeRemaining: number;
  elapsed: number;
  countdown: number;
  alivePlayers: number;
  players?: Map<string, NetPlayer>;
  enemies?: Map<string, NetAI>;
  containers?: Map<string, NetContainer>;
}

export interface NetworkCallbacks {
  onWelcome(payload: WelcomePayload): void;
  onReconcile(payload: ReconcilePayload): void;
  onShotFired(payload: ShotFiredPayload): void;
  onDamageTaken(payload: DamageTakenPayload): void;
  onDamageDealt(payload: DamageDealtPayload): void;
  onPlayerDied(payload: PlayerDiedPayload): void;
  onAIDied(payload: { aiId: string; killerId: string | null }): void;
  onContainerOpened(payload: ContainerOpenedPayload): void;
  onLootPicked(payload: LootPickedPayload): void;
  onInventoryChanged(payload: InventoryChangedPayload): void;
  onExtractionProgress(payload: ExtractionStatusPayload): void;
  onExtractionCancelled(payload: ExtractionStatusPayload & { reason?: string }): void;
  onExtractionCompleted(payload: ExtractionStatusPayload): void;
  onMatchPhase(payload: MatchTimerPayload): void;
  onMatchEnded(payload: { reason: string }): void;
  onSummary(payload: RaidSummary): void;
  onAnnouncement(payload: AnnouncementPayload): void;
  onSupplyDrop(payload: SupplyDropPayload): void;
  onRejected(payload: ActionRejectedPayload): void;
  onPong(latencyMs: number): void;
  onLeave(code: number): void;
  onError(message: string): void;
  /** Fired while the client is trying to take its held seat back. */
  onReconnecting(attempt: number, maxAttempts: number): void;
  onReconnected(): void;
}

export interface ConnectOptions {
  endpoint: string;
  accessToken?: string | undefined;
  demoUserId?: string | undefined;
  demoUsername?: string | undefined;
  loadoutId?: string | null | undefined;
  mapId: string;
}

/**
 * Thin wrapper around the Colyseus room.
 *
 * Keeps all protocol knowledge in one place: the rest of the client speaks in
 * callbacks and `send*` methods and never touches message names directly.
 */
/** How hard the client tries to take its seat back before giving up. */
const RECONNECT_ATTEMPTS = 4;
const RECONNECT_DELAY_MS = 1_500;

export class NetworkClient {
  private client: Client | null = null;
  private room: Room<NetState> | null = null;
  private callbacks: NetworkCallbacks | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private inputSeq = 0;
  private reconnectionToken = '';
  private leaving = false;

  async connect(options: ConnectOptions, callbacks: NetworkCallbacks): Promise<Room<NetState>> {
    const client = new Client(options.endpoint);
    this.client = client;
    this.callbacks = callbacks;
    const room = await client.joinOrCreate<NetState>('raid', {
      ...(options.accessToken ? { accessToken: options.accessToken } : {}),
      ...(options.demoUserId ? { demoUserId: options.demoUserId } : {}),
      ...(options.demoUsername ? { demoUsername: options.demoUsername } : {}),
      loadoutId: options.loadoutId ?? null,
      mapId: options.mapId,
    });
    this.bind(room);
    this.startPing();
    return room;
  }

  /**
   * Wire a room's handlers. Called on the first join and again after a
   * successful reconnect, because a reconnect hands back a new Room instance.
   */
  private bind(room: Room<NetState>): void {
    const callbacks = this.callbacks;
    if (!callbacks) return;
    this.room = room;
    this.reconnectionToken = room.reconnectionToken;

    room.onMessage(ServerMessage.Welcome, callbacks.onWelcome);
    room.onMessage(ServerMessage.Reconcile, callbacks.onReconcile);
    room.onMessage(ServerMessage.ShotFired, callbacks.onShotFired);
    room.onMessage(ServerMessage.DamageTaken, callbacks.onDamageTaken);
    room.onMessage(ServerMessage.DamageDealt, callbacks.onDamageDealt);
    room.onMessage(ServerMessage.PlayerDied, callbacks.onPlayerDied);
    room.onMessage(ServerMessage.AIDied, callbacks.onAIDied);
    room.onMessage(ServerMessage.ContainerOpened, callbacks.onContainerOpened);
    room.onMessage(ServerMessage.LootPicked, callbacks.onLootPicked);
    room.onMessage(ServerMessage.InventoryChanged, callbacks.onInventoryChanged);
    room.onMessage(ServerMessage.ExtractionStarted, callbacks.onExtractionProgress);
    room.onMessage(ServerMessage.ExtractionCancelled, callbacks.onExtractionCancelled);
    room.onMessage(ServerMessage.ExtractionCompleted, callbacks.onExtractionCompleted);
    room.onMessage(ServerMessage.MatchPhase, callbacks.onMatchPhase);
    room.onMessage(ServerMessage.MatchEnded, callbacks.onMatchEnded);
    room.onMessage(ServerMessage.RaidSummaryReady, callbacks.onSummary);
    room.onMessage(ServerMessage.Announcement, callbacks.onAnnouncement);
    room.onMessage(ServerMessage.SupplyDrop, callbacks.onSupplyDrop);
    room.onMessage(ServerMessage.ActionRejected, callbacks.onRejected);
    room.onMessage(ServerMessage.PlayerJoined, () => undefined);
    room.onMessage(ServerMessage.PlayerLeft, () => undefined);
    room.onMessage(ServerMessage.Pong, (payload: { t: number }) => {
      callbacks.onPong(Math.max(0, Date.now() - payload.t));
    });

    room.onError((code, message) => callbacks.onError(message ?? `error ${code}`));
    room.onLeave((code) => {
      this.stopPing();
      // 1000 is a clean close (we left, or the raid ended). Anything else is a
      // dropped socket, and the server is holding our seat — go get it back.
      if (this.leaving || code === 1000) {
        callbacks.onLeave(code);
        return;
      }
      void this.attemptReconnect(code);
    });
  }

  private async attemptReconnect(closeCode: number): Promise<void> {
    const callbacks = this.callbacks;
    const client = this.client;
    if (!callbacks || !client || !this.reconnectionToken) {
      callbacks?.onLeave(closeCode);
      return;
    }

    for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS; attempt += 1) {
      callbacks.onReconnecting(attempt, RECONNECT_ATTEMPTS);
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
      if (this.leaving) return;
      try {
        const room = await client.reconnect<NetState>(this.reconnectionToken);
        this.bind(room);
        this.startPing();
        callbacks.onReconnected();
        return;
      } catch {
        // Seat may still be held; keep trying until the grace window closes.
      }
    }
    callbacks.onLeave(closeCode);
  }

  get state(): NetState | null {
    return this.room?.state ?? null;
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get connected(): boolean {
    return this.room !== null;
  }

  /** Send one simulated input frame. Returns the sequence number used. */
  sendInput(frame: {
    dt: number;
    forward: number;
    right: number;
    yaw: number;
    pitch: number;
    sprint: boolean;
    crouch: boolean;
    ads: boolean;
    px: number;
    py: number;
    pz: number;
  }): number {
    this.inputSeq += 1;
    this.room?.send(ClientMessage.Input, { seq: this.inputSeq, ...frame });
    return this.inputSeq;
  }

  get currentSeq(): number {
    return this.inputSeq;
  }

  sendFire(yaw: number, pitch: number, shotId: number): void {
    this.room?.send(ClientMessage.Fire, { seq: this.inputSeq, yaw, pitch, shotId });
  }

  sendReload(): void {
    this.room?.send(ClientMessage.Reload, {});
  }

  sendInteract(containerId: string): void {
    this.room?.send(ClientMessage.Interact, { containerId });
  }

  sendPickup(
    containerId: string,
    worldItemId: string,
    container: 'backpack' | 'secure' = 'backpack',
  ): void {
    this.room?.send(ClientMessage.Pickup, { containerId, worldItemId, container });
  }

  sendDrop(entryId: string): void {
    this.room?.send(ClientMessage.Drop, { entryId });
  }

  sendMoveItem(
    entryId: string,
    toContainer: 'backpack' | 'secure',
    x: number,
    y: number,
    rotated: boolean,
  ): void {
    this.room?.send(ClientMessage.MoveItem, { entryId, toContainer, x, y, rotated });
  }

  sendUseItem(entryId: string): void {
    this.room?.send(ClientMessage.UseItem, { entryId });
  }

  sendEquip(slot: 'primary' | 'secondary'): void {
    this.room?.send(ClientMessage.Equip, { slot });
  }

  sendStartExtraction(extractionPointId: string): void {
    this.room?.send(ClientMessage.StartExtraction, { extractionPointId });
  }

  sendCancelExtraction(): void {
    this.room?.send(ClientMessage.CancelExtraction, {});
  }

  sendDebug(command: string, value?: string | number, x?: number, z?: number): void {
    this.room?.send(ClientMessage.DebugCommand, {
      command,
      ...(value !== undefined ? { value } : {}),
      ...(x !== undefined ? { x } : {}),
      ...(z !== undefined ? { z } : {}),
    });
  }

  async leave(consented = true): Promise<void> {
    this.leaving = true;
    this.stopPing();
    await this.room?.leave(consented);
    this.room = null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.room?.send(ClientMessage.Ping, { t: Date.now() });
    }, 2_000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
