import * as THREE from 'three';
import {
  COMBAT,
  MOVEMENT,
  PlayerRaidState,
  RaidPhase,
  SECTOR_ZERO,
  distance2D,
  getItem,
  getMap,
  getWeaponDefinition,
  makeRng,
  type MapDefinition,
  type WeaponDefinition,
} from '@deadline/shared';
import {
  CollisionWorld,
  createMovementState,
  createTriggerState,
  pullTrigger,
  recoilKick,
  stepMovement,
  type MovementState,
  type TriggerState,
} from '@deadline/game-core';
import { CameraRig } from './camera';
import { ContainerPool, EntityPool } from './entities';
import { EffectsSystem } from './effects';
import { InputController, type InputAction, type InputFrame } from './input';
import { NetworkClient, type ConnectOptions, type NetPlayer, type NetState } from './network';
import { buildWorldScene, type WorldScene } from './scene';
import { AdaptiveQuality } from './quality';
import { audioBus } from './audio';
import { hudStore } from './store';

interface PendingInput {
  seq: number;
  frame: {
    forward: number;
    right: number;
    yaw: number;
    pitch: number;
    sprint: boolean;
    crouch: boolean;
    ads: boolean;
    dt: number;
  };
}

export interface GameClientOptions extends ConnectOptions {
  canvas: HTMLCanvasElement;
  sensitivity: number;
  invertY: boolean;
  audioEnabled: boolean;
  audioVolume: number;
  onDisconnect(reason: string): void;
}

const MAX_PENDING_INPUTS = 180;
const NETWORK_SEND_HZ = 30;

/**
 * The game client.
 *
 * Owns the render loop, client-side prediction and every visual system. It
 * deliberately does not touch React: HUD data goes into `hudStore`, which
 * publishes at a low fixed rate.
 */
export class GameClient {
  private readonly options: GameClientOptions;
  private readonly map: MapDefinition;
  private readonly world: CollisionWorld;
  private readonly network = new NetworkClient();

  private renderer!: THREE.WebGLRenderer;
  private worldScene!: WorldScene;
  private cameraRig!: CameraRig;
  private entities!: EntityPool;
  private containers!: ContainerPool;
  private effects!: EffectsSystem;
  private input!: InputController;
  private localAvatar!: THREE.Group;
  private quality!: AdaptiveQuality;

  private movement: MovementState;
  private yaw = 0;
  private pitch = 0;
  private pending: PendingInput[] = [];
  private lastFrameTime = 0;
  private sendAccumulator = 0;
  private frameHandle = 0;
  private running = false;
  private elapsed = 0;

  private readonly trigger: TriggerState = createTriggerState();
  private shotCounter = 0;
  private readonly rng = makeRng(Math.floor(Math.random() * 1e9));

  private sessionId: string | null = null;
  private assignedExtractions: string[] = [];
  private lastExtractionSound = 0;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private footstepTimer = 0;
  private inventoryOpen = false;

  constructor(options: GameClientOptions) {
    this.options = options;
    this.map = getMap(options.mapId) ?? SECTOR_ZERO;
    this.world = new CollisionWorld(this.map);
    this.movement = createMovementState(0, 0);
  }

  async start(): Promise<void> {
    this.setupRenderer();
    this.setupScene();
    this.setupInput();
    await this.connect();
    this.running = true;
    this.lastFrameTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  async stop(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.input?.dispose();
    window.removeEventListener('resize', this.onResize);
    await this.network.leave(true).catch(() => undefined);
    this.worldScene?.dispose();
    this.renderer?.dispose();
  }

  /**
   * Single owner of the inventory toggle.
   *
   * The keybinding lives in the input controller and the overlay lives in
   * React; routing both through here (and mirroring the flag into the HUD
   * store) is what stops one Tab press from toggling two independent booleans.
   */
  setInventoryOpen(open: boolean): void {
    if (this.inventoryOpen === open) return;
    this.inventoryOpen = open;
    hudStore.patch({ inventoryOpen: open });
    hudStore.flushNow();
    this.syncPointerLock();
  }

  requestPointerLock(): void {
    this.input?.requestPointerLock();
    audioBus.resume();
  }

  takeLoot(containerId: string, worldItemId: string, target: 'backpack' | 'secure'): void {
    this.network.sendPickup(containerId, worldItemId, target);
  }

  takeAllLoot(): void {
    const offer = hudStore.current.lootOffer;
    if (!offer) return;
    for (const item of offer.items) {
      this.network.sendPickup(offer.containerId, item.worldItemId, 'backpack');
    }
  }

  dropItem(entryId: string): void {
    this.network.sendDrop(entryId);
  }

  useItem(entryId: string): void {
    this.network.sendUseItem(entryId);
  }

  moveItem(
    entryId: string,
    toContainer: 'backpack' | 'secure',
    x: number,
    y: number,
    rotated: boolean,
  ): void {
    this.network.sendMoveItem(entryId, toContainer, x, y, rotated);
  }

  sendDebug(command: string, value?: string | number, x?: number, z?: number): void {
    this.network.sendDebug(command, value, x, z);
  }

  closeLootOffer(): void {
    hudStore.patch({ lootOffer: null });
    hudStore.flushNow();
    this.syncPointerLock();
  }

  /**
   * Pointer lock follows the overlays: any open panel (loot, inventory, debug,
   * post-match) hands the cursor back, and closing the last one re-captures it.
   * Without this the canvas swallows every click meant for the HUD.
   */
  private syncPointerLock(): void {
    if (this.overlayOpen()) this.input?.releasePointerLock();
    else this.input?.requestPointerLock();
  }

  /** True while any panel that needs a cursor is on screen. */
  private overlayOpen(): boolean {
    const snapshot = hudStore.current;
    return (
      this.inventoryOpen ||
      snapshot.lootOffer !== null ||
      snapshot.showDebugPanel ||
      snapshot.summary !== null
    );
  }

  // ------------------------------------------------------------------- setup

  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.options.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    window.addEventListener('resize', this.onResize);
  }

  private setupScene(): void {
    this.worldScene = buildWorldScene(this.map);
    const collidables = this.worldScene.scene.children.filter((child) =>
      child.name.startsWith('obstacles_'),
    );
    this.cameraRig = new CameraRig(window.innerWidth / window.innerHeight, { collidables });
    this.entities = new EntityPool(this.worldScene.scene);
    this.containers = new ContainerPool(this.worldScene.scene);
    this.effects = new EffectsSystem(this.worldScene.scene);
    this.quality = new AdaptiveQuality(this.renderer, this.worldScene.sun, {
      onWeatherDensity: (density) => this.worldScene.rain.setDensity(density),
    });

    // The local character is drawn from the shared geometry so third-person
    // framing matches what everybody else sees.
    this.localAvatar = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        MOVEMENT.playerRadius,
        MOVEMENT.playerHeight - MOVEMENT.playerRadius * 2,
        6,
        12,
      ),
      new THREE.MeshStandardMaterial({ color: '#7f93b5', roughness: 0.65, metalness: 0.2 }),
    );
    body.position.y = MOVEMENT.playerHeight / 2;
    body.castShadow = true;
    this.localAvatar.add(body);
    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.72),
      new THREE.MeshStandardMaterial({ color: '#1b2029', roughness: 0.5, metalness: 0.5 }),
    );
    weapon.position.set(0.24, 1.18, -0.44);
    this.localAvatar.add(weapon);
    this.worldScene.scene.add(this.localAvatar);
  }

  private setupInput(): void {
    audioBus.setEnabled(this.options.audioEnabled);
    audioBus.setVolume(this.options.audioVolume);
    this.input = new InputController(this.options.canvas, {
      sensitivity: this.options.sensitivity,
      invertY: this.options.invertY,
      onAction: (action) => this.handleAction(action),
      canCapturePointer: () => !this.overlayOpen(),
    });
  }

  private async connect(): Promise<void> {
    hudStore.patch({ phase: 'connecting' });
    hudStore.flushNow();

    await this.network.connect(this.options, {
      onWelcome: (payload) => {
        this.sessionId = payload.sessionId;
        this.assignedExtractions = payload.assignedExtractions;
        hudStore.patch({
          connected: true,
          debugEnabled: payload.debugEnabled,
        });
        hudStore.flushNow();
      },
      onReconcile: (payload) => this.reconcile(payload),
      onShotFired: (payload) => {
        const origin = new THREE.Vector3(payload.origin.x, payload.origin.y, payload.origin.z);
        for (const hit of payload.hits) {
          this.effects.spawnTracer(origin, new THREE.Vector3(hit.x, hit.y, hit.z), hit.hit);
        }
        this.effects.spawnMuzzleFlash(origin);
        const isLocal = payload.shooterId === this.sessionId;
        const distance = this.localPosition().distanceTo(origin);
        audioBus.play(isLocal || distance < 25 ? 'gunshot' : 'gunshot_distant', { distance });
      },
      onDamageTaken: (payload) => {
        hudStore.patch({ health: payload.health, armor: payload.armor });
        const angle = Math.atan2(
          payload.fromX - this.movement.x,
          payload.fromZ - this.movement.z,
        );
        hudStore.pushDamageIndicator(angle);
        this.effects.addShake(0.09);
        audioBus.play('hit');
      },
      onDamageDealt: (payload) => {
        hudStore.patch({ hitMarkerAt: Date.now(), headshotMarker: payload.headshot });
        hudStore.flushNow();
        audioBus.play('hitmarker');
      },
      onPlayerDied: (payload) => {
        const killer = payload.killerName ?? 'THE SECTOR';
        hudStore.pushKillFeed(`${killer} ▸ ${payload.playerName}`);
        if (payload.playerId === this.sessionId) {
          audioBus.play('death');
          hudStore.patch({ raidState: PlayerRaidState.Dead });
          hudStore.flushNow();
          this.input?.releasePointerLock();
        }
      },
      onAIDied: (payload) => {
        if (payload.killerId === this.sessionId) hudStore.pushKillFeed('YOU ▸ HOSTILE');
      },
      onContainerOpened: (payload) => {
        hudStore.patch({ lootOffer: { containerId: payload.containerId, items: payload.items } });
        hudStore.flushNow();
        audioBus.play('container_open');
        // Hand the cursor back so the loot list is actually clickable.
        this.syncPointerLock();
      },
      onLootPicked: (payload) => {
        if (payload.byPlayerId !== this.sessionId) return;
        audioBus.play('loot_pickup');
        const offer = hudStore.current.lootOffer;
        if (offer && offer.containerId === payload.containerId) {
          const items = offer.items.filter((item) => item.worldItemId !== payload.worldItemId);
          hudStore.patch({ lootOffer: items.length > 0 ? { ...offer, items } : null });
          hudStore.flushNow();
        }
      },
      onInventoryChanged: (payload) => {
        const value = payload.backpack.entries.reduce((total, entry) => {
          const definition = getItem(entry.itemId);
          return total + (definition?.value ?? 0) * entry.quantity;
        }, 0);
        hudStore.patch({
          inventory: { backpack: payload.backpack, secure: payload.secure },
          backpackValue: value,
        });
        hudStore.flushNow();
      },
      onExtractionProgress: (payload) => {
        if (payload.playerId !== this.sessionId) return;
        hudStore.patch({
          extractionProgress: payload.progress,
          extractionPointId: payload.extractionPointId,
          raidState: PlayerRaidState.Extracting,
        });
        hudStore.flushNow();
        const now = performance.now();
        if (now - this.lastExtractionSound > 900) {
          this.lastExtractionSound = now;
          audioBus.play('extraction');
        }
      },
      onExtractionCancelled: (payload) => {
        if (payload.playerId !== this.sessionId) return;
        hudStore.patch({
          extractionProgress: 0,
          extractionPointId: null,
          raidState: PlayerRaidState.Alive,
        });
        hudStore.flushNow();
      },
      onExtractionCompleted: (payload) => {
        if (payload.playerId !== this.sessionId) return;
        audioBus.play('extraction_complete');
        hudStore.patch({ extractionProgress: 1, raidState: PlayerRaidState.Extracted });
        hudStore.flushNow();
      },
      onMatchPhase: (payload) => {
        hudStore.patch({ phase: payload.phase, timeRemaining: payload.timeRemaining });
        hudStore.flushNow();
        if (payload.phase === RaidPhase.FinalPhase) audioBus.play('alarm');
      },
      onMatchEnded: () => {
        hudStore.patch({ phase: RaidPhase.Ended });
        hudStore.flushNow();
      },
      onSummary: (payload) => {
        hudStore.patch({ summary: payload });
        hudStore.flushNow();
        // The post-match report needs a cursor.
        this.syncPointerLock();
      },
      onAnnouncement: (payload) => {
        hudStore.pushAnnouncement({ ...payload, id: String(Date.now()) });
        if (payload.tone === 'danger') audioBus.play('alarm');
      },
      onSupplyDrop: (payload) => {
        hudStore.pushAnnouncement({
          id: String(Date.now()),
          text:
            payload.state === 'inbound'
              ? `SUPPLY DROP INBOUND — ${payload.poiName}`
              : `SUPPLY DROP LANDED — ${payload.poiName}`,
          tone: 'warning',
          durationMs: 5_000,
        });
      },
      onRejected: (payload) => {
        if (payload.action === 'fire' && payload.reason === 'no_ammo') {
          this.network.sendReload();
        }
      },
      onPong: (latency) => hudStore.patch({ ping: latency }),
      onReconnecting: (attempt, maxAttempts) => {
        hudStore.patch({ reconnecting: { attempt, maxAttempts } });
        hudStore.flushNow();
      },
      onReconnected: () => {
        hudStore.patch({ reconnecting: null, connected: true, connectionError: null });
        hudStore.flushNow();
      },
      onLeave: (code) => {
        hudStore.patch({ connected: false, reconnecting: null });
        hudStore.flushNow();
        if (code !== 1000) {
          this.options.onDisconnect(
            `connection lost (${code}) — your operator was left in the sector`,
          );
        }
      },
      onError: (message) => {
        hudStore.patch({ connectionError: message });
        hudStore.flushNow();
      },
    });
  }

  // -------------------------------------------------------------- game loop

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.loop);

    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    // Clamp so a background tab cannot produce a single enormous step.
    const dt = Math.min(0.1, Math.max(0, rawDt));
    this.elapsed += dt;

    this.adoptSpawnPosition();

    const frame = this.input.sample();
    this.applyLook(frame, dt);
    this.predictMovement(frame, dt);
    this.handleFiring(frame, dt);

    this.sendAccumulator += dt;
    if (this.sendAccumulator >= 1 / NETWORK_SEND_HZ) {
      this.sendInput(frame, this.sendAccumulator);
      this.sendAccumulator = 0;
    }

    this.syncEntitiesFromState(now);

    this.quality.update(dt);
    const shake = this.effects.update(dt);
    this.cameraRig.update(
      new THREE.Vector3(this.movement.x, this.movement.y, this.movement.z),
      this.yaw,
      this.pitch,
      frame.ads,
      shake,
      dt,
    );
    this.updateLocalAvatar(dt);
    this.worldScene.update(this.elapsed, this.cameraRig.camera.position);
    this.updateHud(dt, now);
    this.renderer.render(this.worldScene.scene, this.cameraRig.camera);
  };

  private applyLook(frame: InputFrame, dt: number): void {
    this.yaw += frame.yawDelta;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + frame.pitchDelta));

    const weapon = this.currentWeapon();
    if (weapon) {
      const recovery = weapon.recoil.recovery;
      const kick = this.effects.consumeRecoil(dt, recovery);
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + kick.pitch));
      this.yaw += kick.yaw;
    }
  }

  private predictMovement(frame: InputFrame, dt: number): void {
    const me = this.localPlayer();
    const canMove =
      me === null ||
      (me.raidState === PlayerRaidState.Alive &&
        (this.stateOf()?.phase === RaidPhase.Active ||
          this.stateOf()?.phase === RaidPhase.FinalPhase));

    stepMovement(
      this.movement,
      {
        forward: frame.forward,
        right: frame.right,
        yaw: this.yaw,
        sprint: frame.sprint,
        crouch: frame.crouch,
        ads: frame.ads,
        dt,
      },
      this.world,
      { sprintSpeedMultiplier: 1, canMove },
    );

    // Footsteps are purely cosmetic and driven off predicted speed.
    const speed = Math.hypot(this.movement.vx, this.movement.vz);
    if (speed > 1.2) {
      this.footstepTimer -= dt * (this.movement.sprinting ? 1.7 : 1);
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.48;
        audioBus.play('footstep');
      }
    }
  }

  private sendInput(frame: InputFrame, dt: number): void {
    const payload = {
      dt: Math.min(0.25, dt),
      forward: frame.forward,
      right: frame.right,
      yaw: this.yaw,
      pitch: this.pitch,
      sprint: frame.sprint,
      crouch: frame.crouch,
      ads: frame.ads,
      px: this.movement.x,
      py: this.movement.y,
      pz: this.movement.z,
    };
    const seq = this.network.sendInput(payload);
    this.pending.push({
      seq,
      frame: {
        forward: payload.forward,
        right: payload.right,
        yaw: payload.yaw,
        pitch: payload.pitch,
        sprint: payload.sprint,
        crouch: payload.crouch,
        ads: payload.ads,
        dt: payload.dt,
      },
    });
    if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
  }

  /**
   * Server reconciliation: snap to the authoritative position, then replay
   * every input the server has not acknowledged yet. Without the replay the
   * player would visibly rubber-band on every correction.
   */
  private reconcile(payload: {
    seq: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    stamina: number;
  }): void {
    this.movement.x = payload.x;
    this.movement.y = payload.y;
    this.movement.z = payload.z;
    this.movement.vx = payload.vx;
    this.movement.vz = payload.vz;
    this.movement.stamina = payload.stamina;

    this.pending = this.pending.filter((entry) => entry.seq > payload.seq);
    for (const entry of this.pending) {
      stepMovement(this.movement, entry.frame, this.world, {
        sprintSpeedMultiplier: 1,
        canMove: true,
      });
    }
  }

  private handleFiring(frame: InputFrame, _dt: number): void {
    const me = this.localPlayer();
    const weapon = this.currentWeapon();
    const blocked = this.inventoryOpen || !me || me.raidState !== PlayerRaidState.Alive || !weapon;

    if (!weapon) return;
    // Still advance the trigger when firing is blocked, so releasing the mouse
    // inside a menu re-arms a semi-automatic weapon like it would outside one.
    const wantsToFire = pullTrigger(this.trigger, {
      weapon,
      firing: frame.firing && !blocked,
      now: performance.now(),
    });
    if (!wantsToFire || blocked) return;

    if (me!.ammoInMag <= 0) {
      this.network.sendReload();
      return;
    }

    this.shotCounter += 1;
    this.network.sendFire(this.yaw, this.pitch, this.shotCounter);

    const kick = recoilKick(
      weapon,
      { ads: frame.ads, consecutiveShots: this.trigger.consecutiveShots },
      this.rng,
    );
    this.effects.addRecoil(kick.pitch, kick.yaw);
  }

  private syncEntitiesFromState(now: number): void {
    const state = this.stateOf();
    // `room.state` exists as soon as the room resolves, but its collections
    // are only populated once the first patch decodes — so every one of them
    // has to be treated as possibly absent for the first few frames.
    if (!state) return;

    state.players?.forEach((player: NetPlayer, sessionId: string) => {
      if (sessionId === this.sessionId) return;
      this.entities.push(sessionId, 'player', {
        x: player.x,
        y: player.y,
        z: player.z,
        rotationY: player.rotationY,
        alive:
          player.raidState === PlayerRaidState.Alive ||
          player.raidState === PlayerRaidState.Extracting,
      });
    });

    state.enemies?.forEach((enemy, id: string) => {
      this.entities.push(id, 'ai', {
        x: enemy.x,
        y: enemy.y,
        z: enemy.z,
        rotationY: enemy.rotationY,
        alive: enemy.alive,
        archetype: enemy.archetype,
      });
    });

    state.containers?.forEach((container, id: string) => {
      this.containers.sync(id, {
        x: container.x,
        y: container.y,
        z: container.z,
        rotationY: container.rotationY,
        containerType: container.containerType,
        opened: container.opened,
        empty: container.empty,
        locked: container.lockedRoomId !== '',
      });
    });

    this.entities.update(now);
  }

  private updateLocalAvatar(dt: number): void {
    this.localAvatar.position.set(this.movement.x, this.movement.y, this.movement.z);
    this.localAvatar.rotation.y = THREE.MathUtils.lerp(
      this.localAvatar.rotation.y,
      this.yaw,
      Math.min(1, dt * 16),
    );
    this.localAvatar.scale.y = this.movement.crouching ? 0.68 : 1;

    // Backed into a wall the camera has nowhere to go, so the character would
    // fill the screen. Fade it out instead of blinding the player.
    const opacity = this.cameraRig.avatarOpacity;
    this.localAvatar.visible = opacity > 0.02;
    for (const child of this.localAvatar.children) {
      const material = (child as THREE.Mesh).material as THREE.Material | undefined;
      if (!material) continue;
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.65;
    }
  }

  private updateHud(dt: number, now: number): void {
    this.fpsAccumulator += dt;
    this.fpsFrames += 1;
    if (this.fpsAccumulator >= 0.5) {
      hudStore.patch({
        fps: Math.round(this.fpsFrames / this.fpsAccumulator),
        quality: this.quality.current,
      });
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
    }

    const state = this.stateOf();
    const me = this.localPlayer();
    const weapon = this.currentWeapon();

    if (state) {
      hudStore.patch({
        phase: state.phase as RaidPhase,
        timeRemaining: state.timeRemaining,
        countdown: state.countdown,
        alivePlayers: state.alivePlayers,
      });
    }

    if (me) {
      hudStore.patch({
        health: me.health,
        armor: me.armor,
        stamina: this.movement.stamina,
        raidState: me.raidState as PlayerRaidState,
        weaponId: me.currentWeaponId,
        weaponName: weapon?.name ?? '—',
        ammoInMag: me.ammoInMag,
        magazineSize: weapon?.magazineSize ?? 0,
        reserveAmmo: me.reserveAmmo,
        reloading: me.reloading,
        kills: me.kills,
        aiKills: me.aiKills,
        damageDealt: Math.round(me.damageDealt),
      });
    }

    hudStore.patch({
      compassHeading: ((-this.yaw * 180) / Math.PI + 360) % 360,
      prompt: this.findPrompt(),
      assignedExtractions: this.extractionInfo(),
    });

    hudStore.expire(Date.now());
    hudStore.flush(now);
  }

  private findPrompt(): { containerId: string; label: string; distance: number; locked: boolean } | null {
    const state = this.stateOf();
    if (!state) return null;
    let best: { containerId: string; label: string; distance: number; locked: boolean } | null = null;
    state.containers?.forEach((container, id: string) => {
      if (container.empty) return;
      const distance = distance2D(
        { x: this.movement.x, z: this.movement.z },
        { x: container.x, z: container.z },
      );
      if (distance > COMBAT.interactionRange) return;
      if (best && best.distance <= distance) return;
      best = {
        containerId: id,
        label: container.ownerName
          ? `SEARCH ${container.ownerName.toUpperCase()}`
          : container.opened
            ? 'SEARCH AGAIN'
            : 'SEARCH',
        distance,
        locked: container.lockedRoomId !== '',
      };
    });
    return best;
  }

  private extractionInfo(): { id: string; name: string; distance: number; bearing: number }[] {
    return this.assignedExtractions
      .map((id) => {
        const point = this.map.extractions.find((entry) => entry.id === id);
        if (!point) return null;
        const dx = point.position.x - this.movement.x;
        const dz = point.position.z - this.movement.z;
        return {
          id,
          name: point.name,
          distance: Math.hypot(dx, dz),
          bearing: ((Math.atan2(-dx, -dz) * 180) / Math.PI + 360) % 360,
        };
      })
      .filter((entry): entry is { id: string; name: string; distance: number; bearing: number } =>
        entry !== null,
      );
  }

  // ---------------------------------------------------------------- actions

  private handleAction(action: InputAction): void {
    switch (action) {
      case 'reload':
        this.network.sendReload();
        audioBus.play('reload');
        break;
      case 'interact':
      case 'loot': {
        const prompt = hudStore.current.prompt;
        if (prompt) this.network.sendInteract(prompt.containerId);
        break;
      }
      case 'weapon1':
        this.network.sendEquip('primary');
        break;
      case 'weapon2':
        this.network.sendEquip('secondary');
        break;
      case 'extract': {
        const nearest = this.extractionInfo()
          .filter((entry) => {
            const point = this.map.extractions.find((candidate) => candidate.id === entry.id);
            return point ? entry.distance <= point.radius : false;
          })
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest) this.network.sendStartExtraction(nearest.id);
        break;
      }
      case 'inventory':
        this.setInventoryOpen(!this.inventoryOpen);
        break;
      case 'escape':
        // Escape closes whatever is open before it gives up the mouse.
        if (this.inventoryOpen) this.setInventoryOpen(false);
        else if (hudStore.current.lootOffer) this.closeLootOffer();
        else this.input.releasePointerLock();
        break;
      case 'debug':
        if (hudStore.current.debugEnabled) {
          hudStore.patch({ showDebugPanel: !hudStore.current.showDebugPanel });
          hudStore.flushNow();
          this.syncPointerLock();
        }
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- helpers

  private stateOf(): NetState | null {
    return this.network.state;
  }

  private localPlayer(): NetPlayer | null {
    const state = this.network.state;
    if (!state || !this.sessionId) return null;
    return state.players?.get(this.sessionId) ?? null;
  }

  private currentWeapon(): WeaponDefinition | undefined {
    const me = this.localPlayer();
    if (!me?.currentWeaponId) return undefined;
    return getWeaponDefinition(me.currentWeaponId);
  }

  private localPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.movement.x, this.movement.y, this.movement.z);
  }

  /**
   * Adopt the server's spawn position once, the first time our own player
   * appears in the replicated state. Prediction takes over from there.
   */
  private adoptSpawnPosition(): void {
    if (!this.needsSpawnSync) return;
    const me = this.localPlayer();
    if (!me) return;
    this.needsSpawnSync = false;
    this.movement = createMovementState(me.x, me.z);
    this.yaw = me.rotationY;
    this.pitch = 0;
    this.pending = [];
  }

  private needsSpawnSync = true;

  private readonly onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.cameraRig.setAspect(window.innerWidth / window.innerHeight);
  };
}
