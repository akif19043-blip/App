import {
  BotDifficulty,
  MOVEMENT,
  PlayerRaidState,
  RaidPhase,
  distance2D,
  type GameConfig,
  type MapDefinition,
  type Rng,
  type Vec3,
} from '@deadline/shared';
import { stepMovement, type CollisionWorld } from '@deadline/game-core';
import type { RaidPlayer } from '../rooms/raidPlayer.js';
import { activeWeapon, isAlive } from '../rooms/raidPlayer.js';
import type { CombatSystem } from './combatSystem.js';
import type { ExtractionSystem } from './extractionSystem.js';
import type { LootSystem, RuntimeContainer } from './lootSystem.js';

type BotGoal = 'loot' | 'engage' | 'extract' | 'wander';

interface BotBrain {
  goal: BotGoal;
  targetContainerId: string | null;
  targetEnemyId: string | null;
  waypoint: Vec3 | null;
  /** Seconds until the bot may re-evaluate its goal. */
  thinkCooldown: number;
  searchCooldown: number;
  lootedContainers: Set<string>;
}

export interface BotDifficultyProfile {
  readonly accuracy: number;
  readonly engageRange: number;
  readonly reactionSeconds: number;
  /** Fraction of the raid remaining at which the bot heads for extraction. */
  readonly extractAtRemainingRatio: number;
}

export const BOT_PROFILES: Readonly<Record<BotDifficulty, BotDifficultyProfile>> = {
  [BotDifficulty.Easy]: {
    accuracy: 0.28,
    engageRange: 26,
    reactionSeconds: 1.1,
    extractAtRemainingRatio: 0.35,
  },
  [BotDifficulty.Normal]: {
    accuracy: 0.46,
    engageRange: 38,
    reactionSeconds: 0.7,
    extractAtRemainingRatio: 0.28,
  },
  [BotDifficulty.Hard]: {
    accuracy: 0.66,
    engageRange: 52,
    reactionSeconds: 0.4,
    extractAtRemainingRatio: 0.22,
  },
};

export interface BotHost {
  readonly config: GameConfig;
  readonly map: MapDefinition;
  readonly world: CollisionWorld;
  readonly rng: Rng;
  readonly loot: LootSystem;
  readonly combat: CombatSystem;
  readonly extraction: ExtractionSystem;
  phase(): RaidPhase;
  timeRemaining(): number;
  players(): Iterable<RaidPlayer>;
  aiPositions(): { id: string; position: Vec3; alive: boolean }[];
}

/**
 * AI Raiders — bots that occupy player slots.
 *
 * They exist so a lobby can start immediately in development and so a thin
 * player population still feels like a raid. They use exactly the same
 * movement, combat and extraction code paths as a human, which means anything
 * a bot can do, a player can do, and vice versa.
 */
export class BotSystem {
  private readonly host: BotHost;
  private readonly brains = new Map<string, BotBrain>();
  private readonly profile: BotDifficultyProfile;

  constructor(host: BotHost, difficulty: BotDifficulty) {
    this.host = host;
    this.profile = BOT_PROFILES[difficulty] ?? BOT_PROFILES[BotDifficulty.Normal];
  }

  register(player: RaidPlayer): void {
    this.brains.set(player.sessionId, {
      goal: 'loot',
      targetContainerId: null,
      targetEnemyId: null,
      waypoint: null,
      thinkCooldown: 0,
      searchCooldown: 0,
      lootedContainers: new Set<string>(),
    });
  }

  unregister(sessionId: string): void {
    this.brains.delete(sessionId);
  }

  update(dt: number): void {
    const phase = this.host.phase();
    if (phase !== RaidPhase.Active && phase !== RaidPhase.FinalPhase) return;

    for (const player of this.host.players()) {
      if (!player.isBot || !isAlive(player)) continue;
      const brain = this.brains.get(player.sessionId);
      if (!brain) continue;
      this.updateBot(player, brain, dt);
    }
  }

  private updateBot(player: RaidPlayer, brain: BotBrain, dt: number): void {
    brain.thinkCooldown -= dt;
    brain.searchCooldown -= dt;

    if (brain.thinkCooldown <= 0) {
      brain.thinkCooldown = 0.45;
      this.decideGoal(player, brain);
    }

    switch (brain.goal) {
      case 'engage':
        this.engage(player, brain, dt);
        break;
      case 'extract':
        this.extract(player, brain, dt);
        break;
      case 'loot':
        this.loot(player, brain, dt);
        break;
      default:
        this.wander(player, brain, dt);
        break;
    }
  }

  private decideGoal(player: RaidPlayer, brain: BotBrain): void {
    const enemy = this.findEnemy(player);
    if (enemy) {
      brain.goal = 'engage';
      brain.targetEnemyId = enemy.id;
      return;
    }
    brain.targetEnemyId = null;

    const remainingRatio = this.host.timeRemaining() / this.host.config.matchDurationSeconds;
    if (remainingRatio <= this.profile.extractAtRemainingRatio) {
      brain.goal = 'extract';
      return;
    }

    const container = this.findContainer(player, brain);
    if (container) {
      brain.goal = 'loot';
      brain.targetContainerId = container.id;
      brain.waypoint = container.position;
      return;
    }
    brain.goal = 'wander';
  }

  private findEnemy(player: RaidPlayer): { id: string; position: Vec3; kind: 'player' | 'ai' } | null {
    const origin = {
      x: player.schema.x,
      y: player.schema.y + MOVEMENT.eyeHeight,
      z: player.schema.z,
    };
    let best: { id: string; position: Vec3; kind: 'player' | 'ai' } | null = null;
    let bestDistance = this.profile.engageRange;

    for (const other of this.host.players()) {
      if (other.sessionId === player.sessionId || !isAlive(other)) continue;
      const distance = distance2D(player.schema, other.schema);
      if (distance > bestDistance) continue;
      const target = {
        x: other.schema.x,
        y: other.schema.y + MOVEMENT.eyeHeight,
        z: other.schema.z,
      };
      if (!this.host.world.hasLineOfSight(origin, target)) continue;
      bestDistance = distance;
      best = { id: other.sessionId, position: target, kind: 'player' };
    }

    for (const agent of this.host.aiPositions()) {
      if (!agent.alive) continue;
      const distance = distance2D(player.schema, agent.position);
      if (distance > bestDistance) continue;
      const target = {
        x: agent.position.x,
        y: agent.position.y + MOVEMENT.eyeHeight,
        z: agent.position.z,
      };
      if (!this.host.world.hasLineOfSight(origin, target)) continue;
      bestDistance = distance;
      best = { id: agent.id, position: target, kind: 'ai' };
    }

    return best;
  }

  private engage(player: RaidPlayer, brain: BotBrain, dt: number): void {
    const enemy = this.findEnemy(player);
    if (!enemy) {
      brain.goal = 'loot';
      return;
    }

    const dx = enemy.position.x - player.schema.x;
    const dz = enemy.position.z - player.schema.z;
    const horizontal = Math.hypot(dx, dz);
    const dy = enemy.position.y - (player.schema.y + MOVEMENT.eyeHeight);

    const spread = (1 - this.profile.accuracy) * 0.11;
    const yaw = Math.atan2(-dx, -dz) + this.host.rng.float(-spread, spread);
    const pitch = Math.atan2(dy, horizontal) + this.host.rng.float(-spread, spread);
    player.yaw = yaw;
    player.pitch = pitch;

    const weapon = activeWeapon(player);
    if (weapon) {
      if (weapon.ammoInMag <= 0) {
        this.host.combat.handleReload(player);
      } else if (horizontal < this.profile.engageRange) {
        this.host.combat.handleFire(player, yaw, pitch);
      }
    }

    // Keep a comfortable distance while shooting.
    const desired = horizontal > 14 ? 1 : horizontal < 6 ? -1 : 0;
    this.drive(player, { forward: desired, right: 0.2, sprint: false, yaw }, dt);
  }

  private loot(player: RaidPlayer, brain: BotBrain, dt: number): void {
    const container = brain.targetContainerId
      ? this.host.loot.get(brain.targetContainerId)
      : undefined;
    if (!container) {
      brain.goal = 'wander';
      return;
    }

    const distance = distance2D(player.schema, container.position);
    if (distance > 2) {
      this.moveTowards(player, container.position, dt, true);
      return;
    }

    if (brain.searchCooldown > 0) return;
    brain.searchCooldown = 1.2;

    if (!container.schema.opened) {
      this.host.loot.open(player, container.id);
      return;
    }
    const next = container.items[0];
    if (next) {
      this.host.loot.pickup(player, container.id, next.id, 'backpack');
      return;
    }
    brain.lootedContainers.add(container.id);
    brain.targetContainerId = null;
    brain.goal = 'wander';
  }

  private extract(player: RaidPlayer, brain: BotBrain, dt: number): void {
    const pointId = player.assignedExtractions[0];
    const point = this.host.map.extractions.find((entry) => entry.id === pointId);
    if (!point) {
      brain.goal = 'wander';
      return;
    }
    const distance = distance2D(player.schema, point.position);
    if (distance > point.radius * 0.5) {
      this.moveTowards(player, point.position, dt, true);
      return;
    }
    if (player.schema.raidState !== PlayerRaidState.Extracting) {
      this.host.extraction.start(player, point.id);
    }
  }

  private wander(player: RaidPlayer, brain: BotBrain, dt: number): void {
    if (!brain.waypoint || distance2D(player.schema, brain.waypoint) < 3) {
      const poi = this.host.rng.pick(this.host.map.pois);
      brain.waypoint = {
        x: poi.center.x + this.host.rng.float(-poi.radius, poi.radius),
        y: 0,
        z: poi.center.z + this.host.rng.float(-poi.radius, poi.radius),
      };
    }
    this.moveTowards(player, brain.waypoint, dt, false);
  }

  private moveTowards(player: RaidPlayer, target: Vec3, dt: number, sprint: boolean): void {
    const dx = target.x - player.schema.x;
    const dz = target.z - player.schema.z;
    const yaw = Math.atan2(-dx, -dz);
    player.yaw = yaw;
    this.drive(player, { forward: 1, right: 0, sprint, yaw }, dt);
  }

  private drive(
    player: RaidPlayer,
    input: { forward: number; right: number; sprint: boolean; yaw: number },
    dt: number,
  ): void {
    stepMovement(
      player.movement,
      {
        forward: input.forward,
        right: input.right,
        yaw: input.yaw,
        sprint: input.sprint,
        crouch: false,
        ads: false,
        dt,
      },
      this.host.world,
      { sprintSpeedMultiplier: player.perks.sprintSpeedMultiplier, canMove: true },
    );
    player.schema.x = player.movement.x;
    player.schema.z = player.movement.z;
    player.schema.rotationY = input.yaw;
    player.schema.pitch = player.pitch;
    player.schema.vx = player.movement.vx;
    player.schema.vz = player.movement.vz;
    player.schema.stamina = player.movement.stamina;
    player.schema.sprinting = player.movement.sprinting;
  }

  private findContainer(player: RaidPlayer, brain: BotBrain): RuntimeContainer | null {
    let best: RuntimeContainer | null = null;
    let bestDistance = 130;
    for (const container of this.host.loot.all()) {
      if (brain.lootedContainers.has(container.id)) continue;
      if (container.schema.empty) continue;
      const distance = distance2D(player.schema, container.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = container;
      }
    }
    return best;
  }
}
