import { Room, type Client } from '@colyseus/core';
import {
  AIArchetype,
  AnalyticsEvent,
  BotDifficulty,
  ContainerType,
  COMBAT,
  CLIENT_MESSAGE_SCHEMAS,
  ClientMessage,
  MOVEMENT,
  PlayerRaidState,
  RaidPhase,
  RaidResult,
  SECTOR_ZERO,
  ServerMessage,
  calculateRaidXp,
  dailyResetKey,
  distance2D,
  getItem,
  getMap,
  hashString,
  makeRng,
  requireWeaponDefinition,
  track,
  type GameConfig,
  type MapDefinition,
  type RaidSummary,
  type Rng,
  type Vec3,
} from '@deadline/shared';
import {
  CollisionWorld,
  applyRaidToMissions,
  maxLegalDistance,
  pickSafeSpawn,
  stepMovement,
  type AIAgent,
} from '@deadline/game-core';
import type {
  DeployManifest,
  FinalizeRaidPayload,
  MissionRow,
  Persistence,
  SurvivingStack,
} from '@deadline/persistence';
import { type AIState, type ContainerState, PlayerState, RaidState } from './state.js';
import {
  createRaidPlayer,
  ensureFallbackWeapon,
  isAlive,
  syncWeaponState,
  type RaidPlayer,
} from './raidPlayer.js';
import { AntiCheat } from '../systems/antiCheat.js';
import { AISystem } from '../systems/aiSystem.js';
import { BotSystem } from '../systems/botSystem.js';
import { CombatSystem } from '../systems/combatSystem.js';
import { ExtractionSystem } from '../systems/extractionSystem.js';
import { LootSystem } from '../systems/lootSystem.js';
import { MatchSystem } from '../systems/matchSystem.js';
import { authenticate, AuthError } from '../auth.js';
import { serverConfig } from '../config.js';
import { errorFields, log } from '../logger.js';
import { getPersistence } from '../persistence/index.js';

interface RaidAuth {
  userId: string;
  username: string;
  demo: boolean;
  loadoutId: string | null;
  mapId: string;
}

/**
 * The authoritative raid room.
 *
 * Responsibilities are delegated to the systems in `../systems`; this class
 * owns the Colyseus plumbing, the player registry and the raid lifecycle —
 * deploy, simulate, resolve, persist.
 */
export class RaidRoom extends Room<RaidState> {
  private readonly config: GameConfig = serverConfig.game;
  private map: MapDefinition = SECTOR_ZERO;
  private world!: CollisionWorld;
  private rng!: Rng;
  private seed = 0;

  private readonly runtimePlayers = new Map<string, RaidPlayer>();
  private persistence: Persistence | null = null;
  private antiCheat!: AntiCheat;
  private match!: MatchSystem;
  private loot!: LootSystem;
  private ai!: AISystem;
  private combat!: CombatSystem;
  private extraction!: ExtractionSystem;
  private bots!: BotSystem;

  private botCounter = 0;
  private disposed = false;
  private readonly announced = new Set<string>();

  // --------------------------------------------------------------- lifecycle

  override async onCreate(options: { mapId?: string }): Promise<void> {
    this.maxClients = this.config.maxPlayers;
    this.map = getMap(options?.mapId ?? 'sector_zero') ?? SECTOR_ZERO;
    this.seed = hashString(`${this.roomId}:${Date.now()}`) >>> 0;
    this.rng = makeRng(this.seed);
    this.world = new CollisionWorld(this.map);
    this.persistence = await getPersistence();
    this.antiCheat = new AntiCheat(this.roomId, this.persistence);

    const state = new RaidState();
    state.mapId = this.map.id;
    state.seed = this.seed;
    state.timeRemaining = this.config.matchDurationSeconds;
    state.phase = RaidPhase.Waiting;
    this.setState(state);

    this.match = new MatchSystem(this.config, {
      onPhaseChanged: (phase, previous) => this.handlePhaseChanged(phase, previous),
      onCountdownTick: (seconds) => {
        this.state.countdown = seconds;
      },
      onRaidStarted: () => this.handleRaidStarted(),
      onRaidEnded: (reason) => void this.handleRaidEnded(reason),
    });

    this.loot = new LootSystem({
      roomId: this.roomId,
      config: this.config,
      map: this.map,
      seed: this.seed,
      addContainerToState: (container: ContainerState) =>
        this.state.containers.set(container.id, container),
      removeContainerFromState: (id: string) => this.state.containers.delete(id),
      sendTo: (sessionId, type, payload) => this.sendTo(sessionId, type, payload),
      broadcast: (type, payload) => this.broadcast(type, payload),
      announce: (text, tone) => this.announce(text, tone),
    });

    this.ai = new AISystem(
      {
        roomId: this.roomId,
        config: this.config,
        map: this.map,
        world: this.world,
        seed: this.seed,
        players: () => this.runtimePlayers.values(),
        addAIToState: (agent: AIState) => this.state.enemies.set(agent.id, agent),
        removeAIFromState: (id: string) => this.state.enemies.delete(id),
      },
      this.botAccuracyScale(),
    );

    this.combat = new CombatSystem({
      world: this.world,
      rng: this.rng,
      antiCheat: this.antiCheat,
      phase: () => this.match.phase,
      players: () => this.runtimePlayers.values(),
      player: (sessionId) => this.runtimePlayers.get(sessionId),
      aiAgents: () => this.ai.all(),
      aiAgent: (id) => this.ai.get(id),
      broadcast: (type, payload) => this.broadcast(type, payload),
      sendTo: (sessionId, type, payload) => this.sendTo(sessionId, type, payload),
      onPlayerKilled: (victim, killer, weaponId, killerLabel) =>
        void this.handlePlayerKilled(victim, killer, weaponId, killerLabel),
      onAIKilled: (agent, killer) => this.handleAIKilled(agent, killer),
      emitNoise: (x, z, radius) => this.ai.emitNoise(x, z, radius),
    });
    this.ai.attachCombat(this.combat);

    this.extraction = new ExtractionSystem({
      config: this.config,
      map: this.map,
      antiCheat: this.antiCheat,
      phase: () => this.match.phase,
      sendTo: (sessionId, type, payload) => this.sendTo(sessionId, type, payload),
      broadcast: (type, payload) => this.broadcast(type, payload),
      onExtracted: (player) => void this.handleExtracted(player),
    });

    this.bots = new BotSystem(
      {
        config: this.config,
        map: this.map,
        world: this.world,
        rng: this.rng,
        loot: this.loot,
        combat: this.combat,
        extraction: this.extraction,
        phase: () => this.match.phase,
        timeRemaining: () => this.match.timeRemaining,
        players: () => this.runtimePlayers.values(),
        aiPositions: () =>
          [...this.ai.all()].map((agent) => ({
            id: agent.id,
            position: agent.position,
            alive: agent.alive,
          })),
      },
      (serverConfig.botDifficulty as BotDifficulty) ?? BotDifficulty.Normal,
    );

    this.loot.spawnMapContainers();
    this.ai.spawnAll();
    this.registerMessageHandlers();

    this.setPatchRate(1000 / this.config.snapshotRate);
    this.setSimulationInterval(
      (deltaMs) => this.update(deltaMs / 1000),
      1000 / this.config.serverTickRate,
    );

    log.info('raid.room_created', {
      roomId: this.roomId,
      mapId: this.map.id,
      seed: this.seed,
      maxPlayers: this.maxClients,
      persistence: this.persistence?.kind ?? 'none',
    });
  }

  override async onAuth(_client: Client, options: unknown): Promise<RaidAuth> {
    try {
      const { user, options: parsed } = await authenticate(options);
      return {
        userId: user.userId,
        username: user.username,
        demo: user.demo,
        loadoutId: parsed.loadoutId ?? null,
        mapId: parsed.mapId,
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      log.error('raid.auth_failed', errorFields(error));
      throw new AuthError('authentication_failed');
    }
  }

  override async onJoin(client: Client, _options: unknown, auth: RaidAuth): Promise<void> {
    if (this.match.phase === RaidPhase.Ended) {
      throw new Error('raid_finished');
    }

    // Reconnect: hand the session back to the disconnected body.
    const existing = [...this.runtimePlayers.values()].find(
      (player) => player.userId === auth.userId && player.disconnectedAt !== null,
    );
    if (existing) {
      this.reattach(existing, client);
      return;
    }

    const persistence = this.persistence;
    let manifest: DeployManifest = {
      loadoutId: null,
      primaryWeaponId: 'pm9',
      secondaryWeaponId: null,
      armorItemId: null,
      perkIds: [],
      backpack: [],
      secure: [],
    };
    let missions: MissionRow[] = [];

    if (persistence) {
      try {
        await persistence.ensureProfile(auth.userId, auth.username);
        manifest = await persistence.deployLoadout(auth.userId, auth.loadoutId);
        await persistence.ensureDailyMissions(auth.userId, dailyResetKey(), DAILY_POOL_IDS);
        missions = await persistence.listMissions(auth.userId);
      } catch (error) {
        log.error('raid.deploy_load_failed', {
          roomId: this.roomId,
          userId: auth.userId,
          ...errorFields(error),
        });
      }
    }

    const player = this.spawnPlayer({
      sessionId: client.sessionId,
      userId: auth.userId,
      username: auth.username,
      isBot: false,
      manifest,
      missions,
    });

    if (persistence) {
      try {
        player.raidId = await persistence.startRaid(auth.userId, this.roomId, this.map.id);
      } catch (error) {
        log.error('raid.start_record_failed', errorFields(error));
      }
    }

    track(AnalyticsEvent.RaidStarted, {
      room_id: this.roomId,
      player_id: auth.userId,
      map_id: this.map.id,
      demo: auth.demo,
    });

    client.send(ServerMessage.Welcome, {
      sessionId: client.sessionId,
      userId: auth.userId,
      username: auth.username,
      mapId: this.map.id,
      seed: this.seed,
      assignedExtractions: player.assignedExtractions,
      serverTickRate: this.config.serverTickRate,
      matchDurationSeconds: this.config.matchDurationSeconds,
      extractionTimeSeconds: this.config.extractionTimeSeconds,
      isBotFilled: this.config.enableBots,
      debugEnabled: serverConfig.debugTools,
    });
    this.sendInventory(player);

    this.broadcast(ServerMessage.PlayerJoined, {
      sessionId: client.sessionId,
      username: auth.username,
      isBot: false,
    });

    log.info('raid.player_joined', {
      roomId: this.roomId,
      userId: auth.userId,
      username: auth.username,
      sessionId: client.sessionId,
    });
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const player = this.runtimePlayers.get(client.sessionId);
    if (!player) return;

    log.info('raid.player_left', {
      roomId: this.roomId,
      userId: player.userId,
      consented: consented ?? false,
      state: player.schema.raidState,
    });

    if (player.resolved || !this.match.isRunning()) {
      this.removePlayer(client.sessionId);
      return;
    }

    // Disconnect abuse guard: the body stays in the world for a grace period.
    player.disconnectedAt = Date.now();
    player.schema.connected = false;
    this.broadcast(ServerMessage.PlayerLeft, {
      sessionId: client.sessionId,
      username: player.username,
      reason: 'disconnected',
    });
  }

  override onDispose(): void {
    this.disposed = true;
    log.info('raid.room_disposed', { roomId: this.roomId });
  }

  // ----------------------------------------------------------- message setup

  private registerMessageHandlers(): void {
    this.onMessage(ClientMessage.Input, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.Input].safeParse(message);
      if (!parsed.success) {
        this.antiCheat.report(player.userId, 'schema', `input: ${parsed.error.message.slice(0, 120)}`);
        return;
      }
      this.applyInput(player, parsed.data);
    });

    this.onMessage(ClientMessage.Fire, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.Fire].safeParse(message);
      if (!parsed.success) {
        this.antiCheat.report(player.userId, 'schema', 'fire');
        return;
      }
      const reason = this.combat.handleFire(player, parsed.data.yaw, parsed.data.pitch);
      if (reason) this.reject(client, ClientMessage.Fire, reason);
    });

    this.onMessage(ClientMessage.Reload, (client) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      const reason = this.combat.handleReload(player);
      if (reason) this.reject(client, ClientMessage.Reload, reason);
    });

    this.onMessage(ClientMessage.Equip, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.Equip].safeParse(message);
      if (!parsed.success) return;
      const reason = this.combat.handleEquip(player, parsed.data.slot);
      if (reason) this.reject(client, ClientMessage.Equip, reason);
    });

    this.onMessage(ClientMessage.Interact, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player || !isAlive(player)) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.Interact].safeParse(message);
      if (!parsed.success) return;
      const reason = this.loot.open(player, parsed.data.containerId);
      if (reason) {
        if (reason === 'out_of_range') {
          this.antiCheat.report(player.userId, 'interaction_range', parsed.data.containerId);
        }
        this.reject(client, ClientMessage.Interact, reason);
      }
    });

    this.onMessage(ClientMessage.Pickup, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player || !isAlive(player)) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.Pickup].safeParse(message);
      if (!parsed.success) return;
      const { containerId, worldItemId, x, y, rotated, container } = parsed.data;
      const cell =
        x !== undefined && y !== undefined ? { x, y, rotated: rotated ?? false } : undefined;
      const reason = this.loot.pickup(
        player,
        containerId,
        worldItemId,
        container ?? 'backpack',
        cell,
      );
      if (reason) {
        if (reason === 'out_of_range') {
          this.antiCheat.report(player.userId, 'interaction_range', containerId);
        }
        if (reason === 'already_taken') {
          this.antiCheat.report(player.userId, 'loot_ownership', worldItemId);
        }
        this.reject(client, ClientMessage.Pickup, reason);
      } else {
        this.sendInventory(player);
      }
    });

    this.onMessage(ClientMessage.Drop, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player || !isAlive(player)) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.Drop].safeParse(message);
      if (!parsed.success) return;
      const reason = this.loot.drop(player, parsed.data.entryId);
      if (reason) this.reject(client, ClientMessage.Drop, reason);
      else this.sendInventory(player);
    });

    this.onMessage(ClientMessage.MoveItem, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.MoveItem].safeParse(message);
      if (!parsed.success) return;
      const reason = this.moveItem(player, parsed.data);
      if (reason) this.reject(client, ClientMessage.MoveItem, reason);
      else this.sendInventory(player);
    });

    this.onMessage(ClientMessage.UseItem, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player || !isAlive(player)) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.UseItem].safeParse(message);
      if (!parsed.success) return;
      const reason = this.useItem(player, parsed.data.entryId);
      if (reason) this.reject(client, ClientMessage.UseItem, reason);
      else this.sendInventory(player);
    });

    this.onMessage(ClientMessage.StartExtraction, (client, message) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.StartExtraction].safeParse(message);
      if (!parsed.success) return;
      const reason = this.extraction.start(player, parsed.data.extractionPointId);
      if (reason) this.reject(client, ClientMessage.StartExtraction, reason);
    });

    this.onMessage(ClientMessage.CancelExtraction, (client) => {
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      this.extraction.cancel(player, 'cancelled');
    });

    this.onMessage(ClientMessage.Ping, (client, message) => {
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.Ping].safeParse(message);
      if (!parsed.success) return;
      client.send(ServerMessage.Pong, { t: parsed.data.t, serverTime: Date.now() });
    });

    this.onMessage(ClientMessage.DebugCommand, (client, message) => {
      if (!serverConfig.debugTools) return;
      const player = this.runtimePlayers.get(client.sessionId);
      if (!player) return;
      const parsed = CLIENT_MESSAGE_SCHEMAS[ClientMessage.DebugCommand].safeParse(message);
      if (!parsed.success) return;
      this.runDebugCommand(player, parsed.data);
    });
  }

  private reject(client: Client, action: string, reason: string): void {
    client.send(ServerMessage.ActionRejected, { action, reason });
  }

  // ---------------------------------------------------------------- simulate

  private update(dt: number): void {
    if (this.disposed) return;

    this.match.update(dt, this.readyPlayerCount());
    this.state.phase = this.match.phase;
    this.state.timeRemaining = this.match.timeRemaining;
    this.state.elapsed = this.match.elapsed;
    this.state.countdown = this.match.countdown;

    if (this.match.isRunning()) {
      this.ai.update(dt);
      this.bots.update(dt);
      this.loot.updateSupplyDrop(this.match.elapsed);
      this.checkDangerAnnouncements();
    }

    let alive = 0;
    for (const player of [...this.runtimePlayers.values()]) {
      this.combat.update(player);
      this.updateHealing(player);
      if (this.match.isRunning()) {
        this.extraction.update(player, dt);
        this.trackPoiVisits(player);
      }
      if (isAlive(player)) alive += 1;
      this.checkDisconnectTimeout(player);
    }
    this.state.alivePlayers = alive;

    if (this.match.isRunning() && this.everybodyResolved()) {
      this.match.endEarly();
    }
  }

  private applyInput(
    player: RaidPlayer,
    input: {
      seq: number;
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
    },
  ): void {
    if (input.seq <= player.lastInputSeq) return;
    player.lastInputSeq = input.seq;
    player.lastInputAt = Date.now();

    const canMove =
      this.match.isRunning() &&
      player.schema.raidState === PlayerRaidState.Alive;

    // Re-run the exact same movement step the client predicted.
    stepMovement(
      player.movement,
      {
        forward: input.forward,
        right: input.right,
        yaw: input.yaw,
        sprint: input.sprint,
        crouch: input.crouch,
        ads: input.ads,
        dt: input.dt,
      },
      this.world,
      { sprintSpeedMultiplier: player.perks.sprintSpeedMultiplier, canMove },
    );

    player.yaw = input.yaw;
    player.pitch = input.pitch;
    player.schema.x = player.movement.x;
    player.schema.y = player.movement.y;
    player.schema.z = player.movement.z;
    player.schema.vx = player.movement.vx;
    player.schema.vz = player.movement.vz;
    player.schema.rotationY = input.yaw;
    player.schema.pitch = input.pitch;
    player.schema.stamina = player.movement.stamina;
    player.schema.sprinting = player.movement.sprinting;
    player.schema.crouching = player.movement.crouching;
    player.schema.ads = input.ads;
    player.schema.lastProcessedInput = input.seq;

    // Anti-cheat: how far did the client claim to be from where we put it?
    const drift = Math.hypot(input.px - player.movement.x, input.pz - player.movement.z);
    const budget = maxLegalDistance(input.dt, player.perks.sprintSpeedMultiplier);
    if (drift > budget) {
      player.movementStrikes += 1;
      if (player.movementStrikes % 12 === 1) {
        this.antiCheat.report(
          player.userId,
          drift > budget * 6 ? 'position_teleport' : 'speed_hack',
          `drift=${drift.toFixed(2)}m budget=${budget.toFixed(2)}m`,
        );
      }
      // The server's position always wins; the client is corrected below.
      this.sendReconcile(player);
    } else if (drift > 0.35) {
      this.sendReconcile(player);
    }
  }

  private sendReconcile(player: RaidPlayer): void {
    this.sendTo(player.sessionId, ServerMessage.Reconcile, {
      seq: player.lastInputSeq,
      x: player.movement.x,
      y: player.movement.y,
      z: player.movement.z,
      vx: player.movement.vx,
      vy: 0,
      vz: player.movement.vz,
      stamina: player.movement.stamina,
    });
  }

  // ------------------------------------------------------------- lifecycle 2

  private handlePhaseChanged(phase: RaidPhase, previous: RaidPhase): void {
    this.state.phase = phase;
    log.info('raid.phase', { roomId: this.roomId, phase, previous });
    this.broadcast(ServerMessage.MatchPhase, {
      phase,
      timeRemaining: this.match.timeRemaining,
      elapsed: this.match.elapsed,
    });

    if (phase === RaidPhase.Countdown) {
      this.fillWithBots();
      this.lock();
    }
    if (phase === RaidPhase.FinalPhase) {
      this.announce('DEADLINE APPROACHING — 02:00', 'danger');
    }
  }

  private handleRaidStarted(): void {
    for (const player of this.runtimePlayers.values()) {
      if (player.schema.raidState === PlayerRaidState.Deploying) {
        player.schema.raidState = PlayerRaidState.Alive;
      }
    }
    this.announce('DEPLOYED — FIND LOOT. SURVIVE. EXTRACT.', 'info');
    log.info('raid.started', {
      roomId: this.roomId,
      players: this.runtimePlayers.size,
      ai: this.ai.aliveCount(),
    });
  }

  private async handleRaidEnded(reason: 'timer' | 'all_resolved'): Promise<void> {
    this.broadcast(ServerMessage.MatchEnded, { reason });
    log.info('raid.ended', { roomId: this.roomId, reason });

    for (const player of [...this.runtimePlayers.values()]) {
      if (player.resolved) continue;
      // Anyone still in the field when the clock hits zero is MIA.
      player.schema.raidState = PlayerRaidState.MIA;
      await this.resolvePlayer(player, RaidResult.MIA);
    }

    // Give clients a moment to render the post-match screen before disposing.
    this.clock.setTimeout(() => {
      this.disconnect().catch(() => undefined);
    }, 8_000);
  }

  private handleAIKilled(agent: AIAgent, killer: RaidPlayer | null): void {
    const containerId = this.loot.createAIDrop(agent.archetype, agent.position, agent.id);
    if (killer) {
      killer.schema.aiKills += 1;
    }
    this.broadcast(ServerMessage.AIDied, {
      aiId: agent.id,
      killerId: killer?.sessionId ?? null,
      corpseContainerId: containerId,
    });
    log.debug('raid.ai_killed', {
      roomId: this.roomId,
      aiId: agent.id,
      killerId: killer?.userId ?? null,
    });
  }

  private async handlePlayerKilled(
    victim: RaidPlayer,
    killer: RaidPlayer | null,
    weaponId: string | null,
    killerLabel: string | null = null,
  ): Promise<void> {
    if (victim.resolved) return;
    victim.schema.raidState = PlayerRaidState.Dead;
    victim.schema.health = 0;
    this.extraction.cancel(victim, 'died');

    const corpseId = this.loot.createCorpse(victim);
    victim.corpseContainerId = corpseId;

    if (killer && killer.sessionId !== victim.sessionId) {
      killer.schema.kills += 1;
    }

    this.broadcast(ServerMessage.PlayerDied, {
      playerId: victim.sessionId,
      playerName: victim.username,
      killerId: killer?.sessionId ?? null,
      killerName: killer?.username ?? killerLabel,
      weaponId,
      corpseContainerId: corpseId,
    });

    log.info('raid.player_killed', {
      roomId: this.roomId,
      victim: victim.userId,
      killer: killer?.userId ?? null,
      weaponId,
    });

    track(AnalyticsEvent.PlayerDied, {
      room_id: this.roomId,
      player_id: victim.userId,
      killer_id: killer?.userId ?? null,
      weapon_id: weaponId,
    });

    await this.resolvePlayer(victim, RaidResult.KIA);
  }

  private async handleExtracted(player: RaidPlayer): Promise<void> {
    log.info('raid.player_extracted', {
      roomId: this.roomId,
      userId: player.userId,
      lootValue: player.backpack.totalValue(),
    });
    track(AnalyticsEvent.PlayerExtracted, {
      room_id: this.roomId,
      player_id: player.userId,
      loot_value: player.backpack.totalValue(),
    });
    await this.resolvePlayer(player, RaidResult.Extracted);
  }

  /**
   * Write a player's raid to the database and hand them their summary.
   *
   * This is the only place loot becomes permanent. Backpack contents survive
   * only on a successful extraction; the secure container always survives.
   */
  private async resolvePlayer(player: RaidPlayer, result: RaidResult): Promise<void> {
    if (player.resolved) return;
    player.resolved = true;

    const extracted = result === RaidResult.Extracted;
    const survivalSeconds = Math.max(0, Math.round((Date.now() - player.deployedAt) / 1000));

    const backpackEntries = player.backpack.list();
    const secureEntries = player.secure.list();

    const surviving: SurvivingStack[] = [];
    if (extracted) {
      for (const entry of backpackEntries) {
        surviving.push({ itemId: entry.itemId, quantity: entry.quantity });
      }
      // Equipped gear comes home too, but only if you do.
      for (const slot of ['primary', 'secondary'] as const) {
        const weapon = player.weapons[slot];
        if (weapon) surviving.push({ itemId: weapon.definition.id, quantity: 1 });
      }
      if (player.armorItemId) surviving.push({ itemId: player.armorItemId, quantity: 1 });
    }
    for (const entry of secureEntries) {
      surviving.push({ itemId: entry.itemId, quantity: entry.quantity });
    }

    const lootLines = [...backpackEntries, ...secureEntries].map((entry) => {
      const definition = getItem(entry.itemId);
      const isSecure = secureEntries.includes(entry);
      return {
        itemId: entry.itemId,
        quantity: entry.quantity,
        value: (definition?.value ?? 0) * entry.quantity,
        extracted: extracted || isSecure,
      };
    });

    const extractedLootValue = lootLines
      .filter((line) => line.extracted)
      .reduce((total, line) => total + line.value, 0);

    const xp = calculateRaidXp({
      extracted,
      playerKills: player.schema.kills,
      aiKills: player.schema.aiKills,
      extractedLootValue,
      survivalSeconds,
      xpMultiplier: this.config.xpMultiplier,
    });

    const extractedItems: Record<string, number> = {};
    for (const line of lootLines) {
      if (!line.extracted) continue;
      extractedItems[line.itemId] = (extractedItems[line.itemId] ?? 0) + line.quantity;
    }

    const missionUpdates = applyRaidToMissions(player.missions, {
      extracted,
      aiKills: player.schema.aiKills,
      playerKills: player.schema.kills,
      extractedLootValue,
      extractedItems,
      visitedPoiIds: [...player.visitedPois],
    });

    const payload: FinalizeRaidPayload = {
      result,
      survivalSeconds,
      playerKills: player.schema.kills,
      aiKills: player.schema.aiKills,
      damageDealt: player.schema.damageDealt,
      xpEarned: xp.total,
      lootValue: extractedLootValue,
      loot: lootLines,
      stash: surviving,
      missions: missionUpdates.map((update) => {
        const row = player.missions.find((mission) => mission.missionId === update.missionId);
        return {
          missionId: update.missionId,
          progress: update.progress,
          completed: update.completed,
          daily: update.daily,
          resetKey: row?.resetKey ?? null,
        };
      }),
    };

    let creditsEarned = 0;
    let levelBefore = 1;
    let levelAfter = 1;
    let xpEarned = xp.total;

    if (this.persistence && player.raidId && !player.isBot) {
      try {
        const outcome = await this.persistence.finalizeRaid(player.userId, player.raidId, payload);
        creditsEarned = outcome.creditsEarned;
        levelBefore = outcome.levelBefore;
        levelAfter = outcome.levelAfter;
        xpEarned = outcome.xpEarned;
      } catch (error) {
        // The raid is over either way — log loudly rather than lose the client.
        log.error('raid.finalize_failed', {
          roomId: this.roomId,
          userId: player.userId,
          raidId: player.raidId,
          ...errorFields(error),
        });
      }
    }

    const summary: RaidSummary = {
      raidId: player.raidId ?? this.roomId,
      roomId: this.roomId,
      result,
      survivalSeconds,
      playerKills: player.schema.kills,
      aiKills: player.schema.aiKills,
      damageDealt: Math.round(player.schema.damageDealt),
      lootValue: extractedLootValue,
      loot: lootLines
        .filter((line) => line.extracted)
        .map((line) => ({ itemId: line.itemId, quantity: line.quantity, value: line.value })),
      xpEarned,
      levelBefore,
      levelAfter,
      creditsEarned,
      completedMissions: missionUpdates
        .filter((update) => update.justCompleted)
        .map((update) => update.missionId),
    };

    if (!player.isBot) {
      this.sendTo(player.sessionId, ServerMessage.RaidSummaryReady, summary);
    }

    track(AnalyticsEvent.RaidFinished, {
      room_id: this.roomId,
      player_id: player.userId,
      result,
      loot_value: extractedLootValue,
      xp: xpEarned,
    });
  }

  // ------------------------------------------------------------------ helpers

  private spawnPlayer(params: {
    sessionId: string;
    userId: string;
    username: string;
    isBot: boolean;
    manifest: DeployManifest;
    missions: MissionRow[];
  }): RaidPlayer {
    const occupied: Vec3[] = [...this.runtimePlayers.values()].map((player) => ({
      x: player.schema.x,
      y: 0,
      z: player.schema.z,
    }));
    const spawn = pickSafeSpawn(this.map.playerSpawns, occupied, this.rng);

    const schema = new PlayerState();
    const player = createRaidPlayer({
      sessionId: params.sessionId,
      userId: params.userId,
      username: params.username,
      isBot: params.isBot,
      schema,
      manifest: params.manifest,
      missions: params.missions,
      spawnX: spawn.position.x,
      spawnZ: spawn.position.z,
      spawnRotation: spawn.rotationY,
    });
    ensureFallbackWeapon(player);

    // Each player gets a personal subset of the map's extractions.
    player.assignedExtractions = this.rng
      .shuffle(this.map.extractions)
      .slice(0, Math.max(1, Math.min(this.config.extractionsPerPlayer, this.map.extractions.length)))
      .map((point) => point.id);

    if (this.match.phase === RaidPhase.Active || this.match.phase === RaidPhase.FinalPhase) {
      player.schema.raidState = PlayerRaidState.Alive;
    }

    this.runtimePlayers.set(params.sessionId, player);
    this.state.players.set(params.sessionId, schema);
    if (params.isBot) this.bots.register(player);
    return player;
  }

  private removePlayer(sessionId: string): void {
    this.runtimePlayers.delete(sessionId);
    this.state.players.delete(sessionId);
    this.bots.unregister(sessionId);
  }

  private reattach(player: RaidPlayer, client: Client): void {
    const previousSessionId = player.sessionId;
    this.runtimePlayers.delete(previousSessionId);
    this.state.players.delete(previousSessionId);

    const reattached: RaidPlayer = { ...player, sessionId: client.sessionId };
    reattached.disconnectedAt = null;
    reattached.schema.sessionId = client.sessionId;
    reattached.schema.connected = true;
    this.runtimePlayers.set(client.sessionId, reattached);
    this.state.players.set(client.sessionId, reattached.schema);

    client.send(ServerMessage.Welcome, {
      sessionId: client.sessionId,
      userId: reattached.userId,
      username: reattached.username,
      mapId: this.map.id,
      seed: this.seed,
      assignedExtractions: reattached.assignedExtractions,
      serverTickRate: this.config.serverTickRate,
      matchDurationSeconds: this.config.matchDurationSeconds,
      extractionTimeSeconds: this.config.extractionTimeSeconds,
      isBotFilled: this.config.enableBots,
      debugEnabled: serverConfig.debugTools,
    });
    this.sendInventory(reattached);
    log.info('raid.player_reconnected', {
      roomId: this.roomId,
      userId: reattached.userId,
      sessionId: client.sessionId,
    });
  }

  private checkDisconnectTimeout(player: RaidPlayer): void {
    if (player.disconnectedAt === null || player.resolved) return;
    const elapsed = (Date.now() - player.disconnectedAt) / 1000;
    if (elapsed < this.config.disconnectGraceSeconds) return;
    // Left and never came back: treated as MIA, so loot is not kept.
    player.schema.raidState = PlayerRaidState.MIA;
    void this.resolvePlayer(player, RaidResult.MIA).then(() => {
      this.removePlayer(player.sessionId);
    });
  }

  private fillWithBots(): void {
    if (!this.config.enableBots) return;
    const humans = [...this.runtimePlayers.values()].filter((player) => !player.isBot).length;
    const target = Math.min(this.config.maxPlayers, humans + this.config.botCount);
    while (this.runtimePlayers.size < target) {
      this.botCounter += 1;
      const weapon = this.rng.pick(['pm9', 'vx7', 'ar12']);
      const bot = this.spawnPlayer({
        sessionId: `bot_${this.botCounter}`,
        userId: `bot_${this.botCounter}`,
        username: `RAIDER-${String(this.botCounter).padStart(2, '0')}`,
        isBot: true,
        manifest: {
          loadoutId: null,
          primaryWeaponId: weapon,
          secondaryWeaponId: null,
          armorItemId: this.rng.bool(0.5) ? 'armor_light_vest' : null,
          perkIds: [],
          backpack: [],
          secure: [],
        },
        missions: [],
      });
      bot.schema.raidState = PlayerRaidState.Deploying;
      // Bots carry the weapon they spawned with as a real, lootable item.
      syncWeaponState(bot);
    }
    log.info('raid.bots_filled', {
      roomId: this.roomId,
      bots: [...this.runtimePlayers.values()].filter((p) => p.isBot).length,
    });
  }

  private readyPlayerCount(): number {
    let count = 0;
    for (const player of this.runtimePlayers.values()) {
      if (!player.isBot) count += 1;
    }
    return count;
  }

  private everybodyResolved(): boolean {
    let humans = 0;
    let resolved = 0;
    for (const player of this.runtimePlayers.values()) {
      if (player.isBot) continue;
      humans += 1;
      if (player.resolved) resolved += 1;
    }
    return humans > 0 && resolved === humans;
  }

  private trackPoiVisits(player: RaidPlayer): void {
    if (!isAlive(player)) return;
    for (const poi of this.map.pois) {
      if (player.visitedPois.has(poi.id)) continue;
      if (distance2D(player.schema, poi.center) <= poi.radius) {
        player.visitedPois.add(poi.id);
      }
    }
  }

  private checkDangerAnnouncements(): void {
    const remaining = this.match.timeRemaining;
    if (remaining <= 60 && !this.announced.has('alarm60')) {
      this.announced.add('alarm60');
      this.announce('60 SECONDS — GET OUT', 'danger');
    } else if (remaining <= 30 && !this.announced.has('alarm30')) {
      this.announced.add('alarm30');
      this.announce('30 SECONDS', 'danger');
    }
  }

  private updateHealing(player: RaidPlayer): void {
    if (!player.healEntryId || player.healEndsAt === 0) return;
    if (Date.now() < player.healEndsAt) return;
    const entry = player.backpack.get(player.healEntryId);
    player.healEndsAt = 0;
    const entryId = player.healEntryId;
    player.healEntryId = null;
    if (!entry) return;
    const definition = getItem(entry.itemId);
    if (!definition?.healAmount) return;
    player.schema.health = Math.min(
      COMBAT.baseHealth,
      player.schema.health + definition.healAmount,
    );
    player.backpack.consume(entry.itemId, 1);
    if (!player.backpack.get(entryId)) {
      this.sendInventory(player);
    }
  }

  private useItem(player: RaidPlayer, entryId: string): string | null {
    const entry = player.backpack.get(entryId) ?? player.secure.get(entryId);
    if (!entry) return 'not_found';
    const definition = getItem(entry.itemId);
    if (!definition?.healAmount) return 'not_usable';
    if (player.schema.health >= COMBAT.baseHealth) return 'already_full';
    if (player.healEndsAt > Date.now()) return 'busy';
    const duration =
      ((definition.useTimeSeconds ?? 2) / player.perks.healSpeedMultiplier) * 1000;
    player.healEndsAt = Date.now() + duration;
    player.healEntryId = entryId;
    return null;
  }

  private moveItem(
    player: RaidPlayer,
    request: { entryId: string; toContainer: 'backpack' | 'secure'; x: number; y: number; rotated: boolean },
  ): string | null {
    const from = player.backpack.get(request.entryId) ? player.backpack : player.secure;
    const to = request.toContainer === 'secure' ? player.secure : player.backpack;
    const entry = from.get(request.entryId);
    if (!entry) return 'not_found';

    if (from === to) {
      const result = to.move(request.entryId, request.x, request.y, request.rotated);
      return result.ok ? null : (result.reason ?? 'occupied');
    }

    const definition = getItem(entry.itemId);
    if (
      request.toContainer === 'secure' &&
      definition?.rarity === 'legendary' &&
      !this.config.allowLegendaryInSecure
    ) {
      return 'legendary_not_allowed';
    }

    from.remove(request.entryId);
    const result = to.addEntryAt(entry, request.x, request.y, request.rotated);
    if (!result.ok) {
      // Put it back exactly where it was.
      from.addEntryAt(entry, entry.x, entry.y, entry.rotated);
      return result.reason ?? 'occupied';
    }
    return null;
  }

  private sendInventory(player: RaidPlayer): void {
    const reserve: Record<string, number> = {};
    for (const [ammoType, rounds] of player.reserveAmmo) reserve[ammoType] = rounds;
    this.sendTo(player.sessionId, ServerMessage.InventoryChanged, {
      backpack: player.backpack.toJSON(),
      secure: player.secure.toJSON(),
      reserveAmmo: reserve,
    });
    syncWeaponState(player);
  }

  private sendTo(sessionId: string, type: string, payload: unknown): void {
    const client = this.clients.find((candidate) => candidate.sessionId === sessionId);
    client?.send(type, payload);
  }

  private announce(text: string, tone: 'info' | 'warning' | 'danger'): void {
    this.broadcast(ServerMessage.Announcement, {
      id: `${Date.now()}`,
      text,
      tone,
      durationMs: tone === 'danger' ? 4_000 : 3_000,
    });
  }

  private botAccuracyScale(): number {
    switch (serverConfig.botDifficulty) {
      case 'easy':
        return 0.7;
      case 'hard':
        return 1.3;
      default:
        return 1;
    }
  }

  // ------------------------------------------------------------- debug tools

  private runDebugCommand(
    player: RaidPlayer,
    command: { command: string; value?: string | number; x?: number; z?: number },
  ): void {
    switch (command.command) {
      case 'heal':
        player.schema.health = COMBAT.baseHealth;
        player.schema.armor = COMBAT.maxArmor;
        break;
      case 'give_weapon': {
        const id = typeof command.value === 'string' ? command.value : 'ar12';
        try {
          const definition = requireWeaponDefinition(id);
          player.weapons.primary = {
            definition,
            ammoInMag: definition.magazineSize,
          };
          player.activeSlot = 'primary';
          player.reserveAmmo.set(definition.ammoType, 240);
          syncWeaponState(player);
        } catch {
          // Unknown weapon id: ignore rather than crash the room.
        }
        break;
      }
      case 'teleport': {
        if (command.x === undefined || command.z === undefined) break;
        // Resolve against the world so a debug teleport cannot drop the player
        // inside a building.
        const resolved = this.world.resolveCircle(
          command.x,
          command.z,
          MOVEMENT.playerRadius,
          0,
          MOVEMENT.playerHeight,
        );
        player.movement.x = resolved.x;
        player.movement.z = resolved.z;
        player.movement.vx = 0;
        player.movement.vz = 0;
        player.schema.x = resolved.x;
        player.schema.z = resolved.z;
        this.sendReconcile(player);
        break;
      }
      case 'spawn_loot':
        this.loot.createContainer({
          containerType: ContainerType.MilitaryCrate,
          position: { x: player.schema.x + 2, y: 0, z: player.schema.z },
          poiId: 'debug',
          items: [
            { itemId: 'medical_kit', quantity: 1 },
            { itemId: 'gold_watch', quantity: 1 },
          ],
          openedByDefault: false,
        });
        break;
      case 'spawn_enemy':
        this.ai.spawn(
          `debug_${Date.now()}`,
          AIArchetype.Guard,
          player.schema.x + 6,
          player.schema.z + 6,
          12,
          'debug',
        );
        break;
      case 'set_timer':
        if (typeof command.value === 'number') this.match.setTimeRemaining(command.value);
        break;
      case 'kill_self':
        void this.handlePlayerKilled(player, null, null, 'SELF');
        break;
      default:
        break;
    }
    this.sendInventory(player);
  }
}

/** Ids of the daily mission pool, resolved once at module load. */
const DAILY_POOL_IDS: string[] = [
  'daily_kill_ai_10',
  'daily_extract_2',
  'daily_loot_15k',
  'daily_kill_player_1',
  'daily_visit_hospital',
  'daily_visit_warehouse',
  'daily_collect_battery',
];
