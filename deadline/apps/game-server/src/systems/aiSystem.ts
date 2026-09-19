import {
  type AIArchetype,
  PlayerRaidState,
  hashString,
  makeRng,
  type GameConfig,
  type MapDefinition,
  type Rng,
} from '@deadline/shared';
import {
  AI_STATS,
  createAIAgent,
  stepAI,
  type AIAgent,
  type AITargetInfo,
  type CollisionWorld,
  type NoiseEvent,
} from '@deadline/game-core';
import { AIState } from '../rooms/state.js';
import type { RaidPlayer } from '../rooms/raidPlayer.js';
import { isAlive } from '../rooms/raidPlayer.js';
import type { CombatSystem } from './combatSystem.js';
import { log } from '../logger.js';

export interface AISystemHost {
  readonly roomId: string;
  readonly config: GameConfig;
  readonly map: MapDefinition;
  readonly world: CollisionWorld;
  readonly seed: number;
  players(): Iterable<RaidPlayer>;
  addAIToState(state: AIState): void;
  removeAIFromState(id: string): void;
}

/**
 * Owns the PvE population.
 *
 * Every enemy is simulated here, server side; the client only ever receives
 * position, rotation, health and behaviour so it can animate them.
 */
export class AISystem {
  private readonly host: AISystemHost;
  private readonly agents = new Map<string, AIAgent>();
  private readonly schemas = new Map<string, AIState>();
  private readonly noises: NoiseEvent[] = [];
  private readonly rng: Rng;
  private readonly accuracyScale: number;
  private combat: CombatSystem | null = null;
  private deadSince = new Map<string, number>();

  constructor(host: AISystemHost, accuracyScale = 1) {
    this.host = host;
    this.rng = makeRng(hashString(`${host.seed}:ai`));
    this.accuracyScale = accuracyScale;
  }

  attachCombat(combat: CombatSystem): void {
    this.combat = combat;
  }

  spawnAll(): void {
    const spawns = this.rng
      .shuffle(this.host.map.aiSpawns)
      .slice(0, this.host.config.maxAIEnemies);
    for (const spawn of spawns) {
      this.spawn(spawn.id, spawn.archetype, spawn.position.x, spawn.position.z, spawn.patrolRadius, spawn.poiId);
    }
    log.info('ai.spawned', { roomId: this.host.roomId, count: this.agents.size });
  }

  spawn(
    id: string,
    archetype: AIArchetype,
    x: number,
    z: number,
    patrolRadius: number,
    poiId: string,
  ): AIAgent {
    const agent = createAIAgent({
      id: `ai_${id}`,
      archetype,
      spawnId: id,
      poiId,
      x,
      z,
      patrolRadius,
    });
    const schema = new AIState();
    schema.id = agent.id;
    schema.archetype = archetype;
    schema.x = x;
    schema.y = 0;
    schema.z = z;
    schema.health = agent.health;
    schema.maxHealth = agent.maxHealth;
    schema.behaviour = agent.behaviour;
    schema.alive = true;
    this.agents.set(agent.id, agent);
    this.schemas.set(agent.id, schema);
    this.host.addAIToState(schema);
    return agent;
  }

  get(id: string): AIAgent | undefined {
    return this.agents.get(id);
  }

  all(): Iterable<AIAgent> {
    return this.agents.values();
  }

  aliveCount(): number {
    let count = 0;
    for (const agent of this.agents.values()) if (agent.alive) count += 1;
    return count;
  }

  emitNoise(x: number, z: number, radius: number): void {
    this.noises.push({ x, z, radius, age: 0 });
  }

  /** One AI tick: perception, behaviour, shooting and state replication. */
  update(dt: number): void {
    for (const noise of this.noises) noise.age += dt;
    // Noise only matters for a couple of seconds.
    for (let i = this.noises.length - 1; i >= 0; i -= 1) {
      if ((this.noises[i]?.age ?? 0) > 2.5) this.noises.splice(i, 1);
    }

    const targets: AITargetInfo[] = [];
    for (const player of this.host.players()) {
      targets.push({
        id: player.sessionId,
        position: { x: player.schema.x, y: player.schema.y, z: player.schema.z },
        alive: isAlive(player),
        // Extracting or deploying players are not engaged.
        targetable: player.schema.raidState === PlayerRaidState.Alive,
        noisy: player.schema.sprinting,
      });
    }

    const context = {
      world: this.host.world,
      targets,
      noises: this.noises,
      rng: this.rng,
      accuracyScale: this.accuracyScale,
    };

    const now = Date.now();
    for (const agent of this.agents.values()) {
      if (!agent.alive) {
        // Clean the corpse entity up after a while so the state stays small.
        const since = this.deadSince.get(agent.id);
        if (since === undefined) {
          this.deadSince.set(agent.id, now);
          const schema = this.schemas.get(agent.id);
          if (schema) {
            schema.alive = false;
            schema.health = 0;
            schema.behaviour = 'dead';
          }
        } else if (now - since > 30_000) {
          this.agents.delete(agent.id);
          this.schemas.delete(agent.id);
          this.deadSince.delete(agent.id);
          this.host.removeAIFromState(agent.id);
        }
        continue;
      }

      const result = stepAI(agent, context, dt);
      if (result.fired && this.combat) {
        this.combat.fireFromAI(agent, result.weapon, result.aimYaw, result.aimPitch);
      }

      const schema = this.schemas.get(agent.id);
      if (schema) {
        schema.x = agent.position.x;
        schema.y = agent.position.y;
        schema.z = agent.position.z;
        schema.rotationY = agent.rotationY;
        schema.health = agent.health;
        schema.behaviour = agent.behaviour;
        schema.alive = agent.alive;
      }
    }
  }

  /** Credit value multiplier for this archetype's drop, used by the loot roll. */
  lootTier(archetype: AIArchetype): number {
    return AI_STATS[archetype].lootTier;
  }
}
