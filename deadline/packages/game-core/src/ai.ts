import {
  AIArchetype,
  AIBehaviourState,
  MOVEMENT,
  angleDelta,
  distance2D,
  requireWeaponDefinition,
  type Rng,
  type Vec3,
  type WeaponDefinition,
} from '@deadline/shared';
import type { CollisionWorld } from './collision.js';

export interface AIArchetypeStats {
  readonly health: number;
  readonly armor: number;
  readonly weaponId: string;
  /** 0..1 — how tightly shots cluster on the target. */
  readonly accuracy: number;
  /** Metres at which the enemy can notice a target in the open. */
  readonly detectionRange: number;
  /** Field of view in radians (total cone). */
  readonly fov: number;
  readonly moveSpeed: number;
  readonly sprintSpeed: number;
  /** Maximum engagement distance. */
  readonly attackRange: number;
  /** Seconds between spotting a target and opening fire. */
  readonly reactionTime: number;
  /** Rounds fired per burst before a short pause. */
  readonly burstSize: number;
  /** Credit value multiplier applied to its loot drop. */
  readonly lootTier: number;
}

export const AI_STATS: Readonly<Record<AIArchetype, AIArchetypeStats>> = {
  [AIArchetype.Scavenger]: {
    health: 70,
    armor: 0,
    weaponId: 'pm9',
    accuracy: 0.32,
    detectionRange: 42,
    fov: Math.PI * 0.85,
    moveSpeed: 3.1,
    sprintSpeed: 5.2,
    attackRange: 34,
    reactionTime: 0.75,
    burstSize: 3,
    lootTier: 1,
  },
  [AIArchetype.Guard]: {
    health: 110,
    armor: 30,
    weaponId: 'ar12',
    accuracy: 0.56,
    detectionRange: 58,
    fov: Math.PI * 0.75,
    moveSpeed: 3.5,
    sprintSpeed: 5.8,
    attackRange: 58,
    reactionTime: 0.5,
    burstSize: 5,
    lootTier: 2,
  },
  [AIArchetype.Heavy]: {
    health: 160,
    armor: 75,
    weaponId: 'vx7',
    accuracy: 0.48,
    detectionRange: 48,
    fov: Math.PI * 0.7,
    moveSpeed: 2.4,
    sprintSpeed: 3.6,
    attackRange: 40,
    reactionTime: 0.62,
    burstSize: 8,
    lootTier: 3,
  },
};

export interface AIAgent {
  readonly id: string;
  readonly archetype: AIArchetype;
  readonly spawnId: string;
  readonly poiId: string;
  position: Vec3;
  rotationY: number;
  health: number;
  maxHealth: number;
  armor: number;
  behaviour: AIBehaviourState;
  alive: boolean;
  targetId: string | null;
  lastKnownTarget: Vec3 | null;
  homeX: number;
  homeZ: number;
  patrolRadius: number;
  patrolTarget: { x: number; z: number } | null;
  /** Seconds spent in the current behaviour. */
  stateTimer: number;
  /** Counts down to the next legal shot. */
  fireCooldown: number;
  /** Counts down while reloading. */
  reloadTimer: number;
  ammoInMag: number;
  burstRemaining: number;
  /** Delay before the AI reacts to a freshly spotted target. */
  reactionTimer: number;
  /** Seconds since the target was last visible; used to give up the chase. */
  lostTimer: number;
}

export interface AITargetInfo {
  readonly id: string;
  /** Feet position. */
  readonly position: Vec3;
  readonly alive: boolean;
  /** Suppresses detection for extracting/deploying players. */
  readonly targetable: boolean;
  /** Loud targets are noticed further away. */
  readonly noisy: boolean;
}

export interface NoiseEvent {
  readonly x: number;
  readonly z: number;
  /** Metres the noise carries. */
  readonly radius: number;
  /** Seconds since it happened. */
  age: number;
}

export interface AIStepContext {
  readonly world: CollisionWorld;
  readonly targets: readonly AITargetInfo[];
  readonly noises: readonly NoiseEvent[];
  readonly rng: Rng;
  /** Global difficulty scalar (bot difficulty / raid tuning). */
  readonly accuracyScale: number;
}

export interface AIStepResult {
  /** Set when the agent pulled the trigger this tick. */
  readonly fired: boolean;
  readonly weapon: WeaponDefinition;
  /** Aim direction used for the shot, including inaccuracy. */
  readonly aimYaw: number;
  readonly aimPitch: number;
  readonly targetId: string | null;
}

export function createAIAgent(params: {
  id: string;
  archetype: AIArchetype;
  spawnId: string;
  poiId: string;
  x: number;
  z: number;
  patrolRadius: number;
}): AIAgent {
  const stats = AI_STATS[params.archetype];
  const weapon = requireWeaponDefinition(stats.weaponId);
  return {
    id: params.id,
    archetype: params.archetype,
    spawnId: params.spawnId,
    poiId: params.poiId,
    position: { x: params.x, y: 0, z: params.z },
    rotationY: 0,
    health: stats.health,
    maxHealth: stats.health,
    armor: stats.armor,
    behaviour: AIBehaviourState.Idle,
    alive: true,
    targetId: null,
    lastKnownTarget: null,
    homeX: params.x,
    homeZ: params.z,
    patrolRadius: params.patrolRadius,
    patrolTarget: null,
    stateTimer: 0,
    fireCooldown: 0,
    reloadTimer: 0,
    ammoInMag: weapon.magazineSize,
    burstRemaining: 0,
    reactionTimer: 0,
    lostTimer: 0,
  };
}

function eye(position: Vec3): Vec3 {
  return { x: position.x, y: position.y + MOVEMENT.eyeHeight, z: position.z };
}

function canSee(agent: AIAgent, target: AITargetInfo, context: AIStepContext, range: number): boolean {
  const distance = distance2D(agent.position, target.position);
  if (distance > range) return false;
  const stats = AI_STATS[agent.archetype];
  const toTarget = Math.atan2(
    -(target.position.x - agent.position.x),
    -(target.position.z - agent.position.z),
  );
  // Targets already engaged are tracked regardless of facing.
  if (agent.targetId !== target.id) {
    if (Math.abs(angleDelta(agent.rotationY, toTarget)) > stats.fov / 2) return false;
  }
  return context.world.hasLineOfSight(eye(agent.position), eye(target.position));
}

function moveToward(
  agent: AIAgent,
  targetX: number,
  targetZ: number,
  speed: number,
  dt: number,
  world: CollisionWorld,
): void {
  const dx = targetX - agent.position.x;
  const dz = targetZ - agent.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.35) return;
  const stepX = (dx / distance) * speed * dt;
  const stepZ = (dz / distance) * speed * dt;
  const resolved = world.resolveCircle(
    agent.position.x + stepX,
    agent.position.z + stepZ,
    MOVEMENT.playerRadius,
    agent.position.y,
    MOVEMENT.playerHeight,
  );
  agent.position = { x: resolved.x, y: agent.position.y, z: resolved.z };
  const desiredYaw = Math.atan2(-dx, -dz);
  agent.rotationY += angleDelta(agent.rotationY, desiredYaw) * Math.min(1, dt * 6);
}

function faceTowards(agent: AIAgent, target: Vec3, dt: number, turnRate = 5): void {
  const desiredYaw = Math.atan2(
    -(target.x - agent.position.x),
    -(target.z - agent.position.z),
  );
  agent.rotationY += angleDelta(agent.rotationY, desiredYaw) * Math.min(1, dt * turnRate);
}

function pickPatrolTarget(agent: AIAgent, rng: Rng): void {
  const angle = rng.float(0, Math.PI * 2);
  const radius = rng.float(agent.patrolRadius * 0.35, agent.patrolRadius);
  agent.patrolTarget = {
    x: agent.homeX + Math.cos(angle) * radius,
    z: agent.homeZ + Math.sin(angle) * radius,
  };
}

function transition(agent: AIAgent, next: AIBehaviourState): void {
  if (agent.behaviour === next) return;
  agent.behaviour = next;
  agent.stateTimer = 0;
}

/**
 * Advance one AI enemy.
 *
 * Runs on the server only. The room resolves the actual hitscan when
 * `result.fired` is true, so all damage stays in one place.
 */
export function stepAI(agent: AIAgent, context: AIStepContext, dt: number): AIStepResult {
  const stats = AI_STATS[agent.archetype];
  const weapon = requireWeaponDefinition(stats.weaponId);
  const idle: AIStepResult = {
    fired: false,
    weapon,
    aimYaw: agent.rotationY,
    aimPitch: 0,
    targetId: agent.targetId,
  };

  if (!agent.alive) {
    if (agent.behaviour !== AIBehaviourState.Dead) transition(agent, AIBehaviourState.Dead);
    return idle;
  }

  agent.stateTimer += dt;
  agent.fireCooldown = Math.max(0, agent.fireCooldown - dt);
  if (agent.reloadTimer > 0) {
    agent.reloadTimer = Math.max(0, agent.reloadTimer - dt);
    if (agent.reloadTimer === 0) agent.ammoInMag = weapon.magazineSize;
  }

  // ---- perception -------------------------------------------------------
  let visibleTarget: AITargetInfo | null = null;
  let visibleDistance = Number.POSITIVE_INFINITY;
  for (const target of context.targets) {
    if (!target.alive || !target.targetable) continue;
    const range = stats.detectionRange * (target.noisy ? 1.35 : 1);
    if (!canSee(agent, target, context, range)) continue;
    const distance = distance2D(agent.position, target.position);
    if (distance < visibleDistance) {
      visibleDistance = distance;
      visibleTarget = target;
    }
  }

  if (visibleTarget) {
    if (agent.targetId !== visibleTarget.id) {
      agent.targetId = visibleTarget.id;
      agent.reactionTimer = stats.reactionTime;
      transition(agent, AIBehaviourState.Detect);
    }
    agent.lastKnownTarget = { ...visibleTarget.position };
    agent.lostTimer = 0;
  } else {
    agent.lostTimer += dt;
    if (agent.targetId && agent.lostTimer > 4) {
      agent.targetId = null;
      transition(agent, AIBehaviourState.Search);
    }
  }

  // Gunfire pulls idle enemies toward the noise.
  if (!visibleTarget && !agent.targetId) {
    for (const noise of context.noises) {
      if (distance2D(agent.position, { x: noise.x, z: noise.z }) > noise.radius) continue;
      agent.lastKnownTarget = { x: noise.x, y: 0, z: noise.z };
      transition(agent, AIBehaviourState.Search);
      break;
    }
  }

  // ---- behaviour --------------------------------------------------------
  switch (agent.behaviour) {
    case AIBehaviourState.Idle: {
      if (agent.stateTimer > context.rng.float(1.5, 4)) {
        pickPatrolTarget(agent, context.rng);
        transition(agent, AIBehaviourState.Patrol);
      }
      break;
    }

    case AIBehaviourState.Patrol: {
      if (!agent.patrolTarget) pickPatrolTarget(agent, context.rng);
      const patrol = agent.patrolTarget;
      if (patrol) {
        moveToward(agent, patrol.x, patrol.z, stats.moveSpeed * 0.55, dt, context.world);
        if (distance2D(agent.position, { x: patrol.x, z: patrol.z }) < 1.4 || agent.stateTimer > 14) {
          agent.patrolTarget = null;
          transition(agent, AIBehaviourState.Idle);
        }
      }
      break;
    }

    case AIBehaviourState.Detect: {
      if (agent.lastKnownTarget) faceTowards(agent, agent.lastKnownTarget, dt, 8);
      agent.reactionTimer = Math.max(0, agent.reactionTimer - dt);
      if (agent.reactionTimer === 0) {
        transition(agent, visibleDistance <= stats.attackRange ? AIBehaviourState.Attack : AIBehaviourState.Chase);
      }
      break;
    }

    case AIBehaviourState.Chase: {
      const destination = agent.lastKnownTarget;
      if (!destination) {
        transition(agent, AIBehaviourState.Search);
        break;
      }
      moveToward(agent, destination.x, destination.z, stats.sprintSpeed, dt, context.world);
      if (visibleTarget && visibleDistance <= stats.attackRange) {
        transition(agent, AIBehaviourState.Attack);
      } else if (!visibleTarget && agent.lostTimer > 3) {
        transition(agent, AIBehaviourState.Search);
      }
      break;
    }

    case AIBehaviourState.Attack: {
      if (!visibleTarget) {
        transition(agent, AIBehaviourState.Search);
        break;
      }
      faceTowards(agent, visibleTarget.position, dt, 9);

      // Close the gap when the target drifts to the edge of our range.
      if (visibleDistance > stats.attackRange * 0.8) {
        moveToward(
          agent,
          visibleTarget.position.x,
          visibleTarget.position.z,
          stats.moveSpeed,
          dt,
          context.world,
        );
      } else if (visibleDistance < 5 && agent.archetype !== AIArchetype.Heavy) {
        // Back off so melee range does not turn into a stalemate.
        moveToward(
          agent,
          agent.position.x * 2 - visibleTarget.position.x,
          agent.position.z * 2 - visibleTarget.position.z,
          stats.moveSpeed * 0.7,
          dt,
          context.world,
        );
      }

      if (agent.reloadTimer > 0) break;
      if (agent.ammoInMag <= 0) {
        agent.reloadTimer = weapon.reloadTimeSeconds;
        agent.burstRemaining = 0;
        break;
      }
      if (agent.fireCooldown > 0) break;

      if (agent.burstRemaining <= 0) {
        agent.burstRemaining = stats.burstSize;
        agent.fireCooldown = context.rng.float(0.25, 0.7);
        break;
      }

      const aimAt = eye(visibleTarget.position);
      const from = eye(agent.position);
      const dx = aimAt.x - from.x;
      const dy = aimAt.y - from.y;
      const dz = aimAt.z - from.z;
      const horizontal = Math.hypot(dx, dz);
      const accuracy = Math.max(0.05, Math.min(0.99, stats.accuracy * context.accuracyScale));
      // Lower accuracy widens the aim error cone.
      const errorRad = (1 - accuracy) * 0.13 + 0.006;
      const aimYaw = Math.atan2(-dx, -dz) + context.rng.float(-errorRad, errorRad);
      const aimPitch = Math.atan2(dy, horizontal) + context.rng.float(-errorRad, errorRad);

      agent.ammoInMag -= 1;
      agent.burstRemaining -= 1;
      agent.fireCooldown = 60 / weapon.fireRate;
      if (agent.burstRemaining <= 0) agent.fireCooldown += context.rng.float(0.35, 0.9);

      return { fired: true, weapon, aimYaw, aimPitch, targetId: visibleTarget.id };
    }

    case AIBehaviourState.Search: {
      const destination = agent.lastKnownTarget;
      if (destination && distance2D(agent.position, destination) > 2) {
        moveToward(agent, destination.x, destination.z, stats.moveSpeed, dt, context.world);
      } else if (agent.stateTimer > 6) {
        agent.lastKnownTarget = null;
        transition(agent, AIBehaviourState.Return);
      }
      if (visibleTarget) transition(agent, AIBehaviourState.Attack);
      break;
    }

    case AIBehaviourState.Return: {
      moveToward(agent, agent.homeX, agent.homeZ, stats.moveSpeed * 0.7, dt, context.world);
      if (distance2D(agent.position, { x: agent.homeX, z: agent.homeZ }) < 2 || agent.stateTimer > 18) {
        transition(agent, AIBehaviourState.Idle);
      }
      if (visibleTarget) transition(agent, AIBehaviourState.Detect);
      break;
    }

    default:
      break;
  }

  return { ...idle, targetId: agent.targetId };
}
