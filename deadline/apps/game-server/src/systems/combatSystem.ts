import {
  COMBAT,
  MOVEMENT,
  PlayerRaidState,
  RaidPhase,
  ServerMessage,
  shotIntervalSeconds,
  type Rng,
  type Vec3,
  type WeaponDefinition,
} from '@deadline/shared';
import {
  calculateDamage,
  currentSpreadDegrees,
  directionFromAngles,
  resolveHitscan,
  spreadDirection,
  type AIAgent,
  type CollisionWorld,
  type HitTarget,
} from '@deadline/game-core';
import {
  activeWeapon,
  consumeReserve,
  isAlive,
  reserveFor,
  syncWeaponState,
  type RaidPlayer,
} from '../rooms/raidPlayer.js';
import type { AntiCheat } from './antiCheat.js';

export interface CombatHost {
  readonly world: CollisionWorld;
  readonly rng: Rng;
  readonly antiCheat: AntiCheat;
  phase(): RaidPhase;
  players(): Iterable<RaidPlayer>;
  player(sessionId: string): RaidPlayer | undefined;
  aiAgents(): Iterable<AIAgent>;
  aiAgent(id: string): AIAgent | undefined;
  broadcast(type: string, payload: unknown): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  /**
   * @param killerLabel display name when the killer is not a player (an AI
   * archetype, or the sector itself), so the kill feed can name it.
   */
  onPlayerKilled(
    victim: RaidPlayer,
    killer: RaidPlayer | null,
    weaponId: string | null,
    killerLabel: string | null,
  ): void;
  onAIKilled(agent: AIAgent, killer: RaidPlayer | null): void;
  emitNoise(x: number, z: number, radius: number): void;
}

/**
 * Authoritative combat.
 *
 * The client sends "I pulled the trigger, looking this way". Everything else —
 * fire rate, ammo, spread, the trace, the hit zone, the damage and the kill —
 * is decided here. A client that sends a damage number is simply ignored,
 * because no message carries one.
 */
export class CombatSystem {
  private readonly host: CombatHost;

  constructor(host: CombatHost) {
    this.host = host;
  }

  /** Returns an error reason, or null when the shot was taken. */
  handleFire(player: RaidPlayer, yaw: number, pitch: number): string | null {
    const phase = this.host.phase();
    if (phase !== RaidPhase.Active && phase !== RaidPhase.FinalPhase) return 'match_not_active';
    if (!isAlive(player)) return 'not_alive';
    if (player.schema.raidState === PlayerRaidState.Extracting) return 'extracting';

    const weapon = activeWeapon(player);
    if (!weapon) return 'no_weapon';

    const now = Date.now();
    if (player.reloadEndsAt > now) return 'reloading';

    const interval = shotIntervalSeconds(weapon.definition) * 1000 - COMBAT.fireRateToleranceMs;
    if (now - player.lastShotAt < interval) {
      const strikes = this.host.antiCheat.report(
        player.userId,
        'fire_rate',
        `weapon=${weapon.definition.id} delta=${now - player.lastShotAt}ms min=${Math.round(interval)}ms`,
      );
      // First few are treated as latency jitter; the shot is still dropped.
      if (strikes > 30) player.movementStrikes += 1;
      return 'fire_rate';
    }

    if (weapon.ammoInMag <= 0) {
      this.host.antiCheat.report(player.userId, 'ammo', `weapon=${weapon.definition.id} mag=0`);
      return 'no_ammo';
    }

    // Shot accepted — commit the ammo and the timing before resolving hits.
    weapon.ammoInMag -= 1;
    const sinceLastShot = (now - player.lastShotAt) / 1000;
    player.consecutiveShots =
      sinceLastShot > 0.45 ? 0 : Math.min(40, player.consecutiveShots + 1);
    player.lastShotAt = now;
    player.yaw = yaw;
    player.pitch = pitch;
    player.schema.rotationY = yaw;
    player.schema.pitch = pitch;
    syncWeaponState(player);

    const origin: Vec3 = {
      x: player.schema.x,
      y: player.schema.y + MOVEMENT.eyeHeight,
      z: player.schema.z,
    };
    const speed = Math.hypot(player.movement.vx, player.movement.vz);
    const spread = currentSpreadDegrees(weapon.definition, {
      ads: player.schema.ads,
      speed,
      consecutiveShots: player.consecutiveShots,
    });

    const hits = this.fireTrace({
      shooterId: player.sessionId,
      weapon: weapon.definition,
      origin,
      yaw,
      pitch,
      spread,
      attacker: player,
    });

    this.host.broadcast(ServerMessage.ShotFired, {
      shooterId: player.sessionId,
      weaponId: weapon.definition.id,
      origin,
      hits,
    });
    // Gunfire is loud: it pulls nearby AI toward the shooter.
    this.host.emitNoise(player.schema.x, player.schema.z, 55);
    return null;
  }

  /** An AI enemy pulling the trigger goes through the same damage pipeline. */
  fireFromAI(agent: AIAgent, weapon: WeaponDefinition, yaw: number, pitch: number): void {
    const origin: Vec3 = {
      x: agent.position.x,
      y: agent.position.y + MOVEMENT.eyeHeight,
      z: agent.position.z,
    };
    const hits = this.fireTrace({
      shooterId: agent.id,
      weapon,
      origin,
      yaw,
      pitch,
      spread: weapon.spread.base,
      attacker: null,
      aiAttacker: agent,
    });
    this.host.broadcast(ServerMessage.ShotFired, {
      shooterId: agent.id,
      weaponId: weapon.id,
      origin,
      hits,
    });
    this.host.emitNoise(agent.position.x, agent.position.z, 45);
  }

  private fireTrace(params: {
    shooterId: string;
    weapon: WeaponDefinition;
    origin: Vec3;
    yaw: number;
    pitch: number;
    spread: number;
    attacker: RaidPlayer | null;
    aiAttacker?: AIAgent;
  }): { x: number; y: number; z: number; hit: boolean }[] {
    const targets = this.collectTargets(params.shooterId, params.aiAttacker !== undefined);
    const results: { x: number; y: number; z: number; hit: boolean }[] = [];

    for (let pellet = 0; pellet < params.weapon.pellets; pellet += 1) {
      const direction =
        params.spread > 0
          ? spreadDirection(params.yaw, params.pitch, params.spread, this.host.rng)
          : directionFromAngles(params.yaw, params.pitch);

      const trace = resolveHitscan(params.origin, direction, targets, this.host.world);
      results.push({
        x: trace.endPoint.x,
        y: trace.endPoint.y,
        z: trace.endPoint.z,
        hit: trace.hit !== null,
      });

      if (!trace.hit) continue;

      const damage = this.applyHit({
        target: trace.hit.target,
        zone: trace.hit.zone,
        distance: trace.hit.distance,
        weapon: params.weapon,
        attacker: params.attacker,
        aiAttacker: params.aiAttacker ?? null,
      });

      if (damage && params.attacker) {
        this.host.sendTo(params.attacker.sessionId, ServerMessage.DamageDealt, {
          targetId: trace.hit.target.id,
          amount: damage.amount,
          lethal: damage.lethal,
          headshot: trace.hit.zone === 'head',
          targetKind: trace.hit.target.kind,
        });
      }
    }
    return results;
  }

  private collectTargets(shooterId: string, shooterIsAI: boolean): HitTarget[] {
    const targets: HitTarget[] = [];
    for (const other of this.host.players()) {
      if (other.sessionId === shooterId) continue;
      if (!isAlive(other)) continue;
      targets.push({
        id: other.sessionId,
        kind: 'player',
        position: { x: other.schema.x, y: other.schema.y, z: other.schema.z },
        radius: MOVEMENT.playerRadius,
        height: other.schema.crouching ? MOVEMENT.crouchHeight : MOVEMENT.playerHeight,
      });
    }
    // AI enemies do not shoot each other.
    if (!shooterIsAI) {
      for (const agent of this.host.aiAgents()) {
        if (!agent.alive) continue;
        targets.push({
          id: agent.id,
          kind: 'ai',
          position: agent.position,
          radius: MOVEMENT.playerRadius,
          height: MOVEMENT.playerHeight,
        });
      }
    }
    return targets;
  }

  private applyHit(params: {
    target: HitTarget;
    zone: 'head' | 'body' | 'limb';
    distance: number;
    weapon: WeaponDefinition;
    attacker: RaidPlayer | null;
    aiAttacker: AIAgent | null;
  }): { amount: number; lethal: boolean } | null {
    if (params.target.kind === 'player') {
      const victim = this.host.player(params.target.id);
      if (!victim || !isAlive(victim)) return null;

      const result = calculateDamage({
        baseDamage: params.weapon.damage,
        distance: params.distance,
        range: params.weapon.range,
        hitZone: params.zone,
        health: victim.schema.health,
        armor: victim.schema.armor,
      });

      victim.schema.health = result.healthAfter;
      victim.schema.armor = result.armorAfter;

      const attackerPosition = params.attacker
        ? { x: params.attacker.schema.x, z: params.attacker.schema.z }
        : params.aiAttacker
          ? { x: params.aiAttacker.position.x, z: params.aiAttacker.position.z }
          : { x: victim.schema.x, z: victim.schema.z };

      this.host.sendTo(victim.sessionId, ServerMessage.DamageTaken, {
        amount: result.healthDamage,
        fromX: attackerPosition.x,
        fromZ: attackerPosition.z,
        health: result.healthAfter,
        armor: result.armorAfter,
        attackerId: params.attacker?.sessionId ?? params.aiAttacker?.id ?? null,
        attackerName: params.attacker?.username ?? params.aiAttacker?.archetype ?? null,
      });

      if (params.attacker) {
        params.attacker.schema.damageDealt += result.healthDamage;
      }

      if (result.killed) {
        this.host.onPlayerKilled(
          victim,
          params.attacker,
          params.weapon.id,
          params.aiAttacker ? aiDisplayName(params.aiAttacker.archetype) : null,
        );
      }
      return { amount: result.healthDamage, lethal: result.killed };
    }

    const agent = this.host.aiAgent(params.target.id);
    if (!agent || !agent.alive) return null;

    const result = calculateDamage({
      baseDamage: params.weapon.damage,
      distance: params.distance,
      range: params.weapon.range,
      hitZone: params.zone,
      health: agent.health,
      armor: agent.armor,
    });
    agent.health = result.healthAfter;
    agent.armor = result.armorAfter;

    if (params.attacker) {
      params.attacker.schema.damageDealt += result.healthDamage;
      // Being shot at makes the AI aware of the shooter even from behind.
      agent.lastKnownTarget = {
        x: params.attacker.schema.x,
        y: 0,
        z: params.attacker.schema.z,
      };
      if (!agent.targetId) agent.targetId = params.attacker.sessionId;
    }

    if (result.killed) {
      agent.alive = false;
      this.host.onAIKilled(agent, params.attacker);
    }
    return { amount: result.healthDamage, lethal: result.killed };
  }

  /** Start a reload. Returns an error reason or null. */
  handleReload(player: RaidPlayer): string | null {
    if (!isAlive(player)) return 'not_alive';
    const weapon = activeWeapon(player);
    if (!weapon) return 'no_weapon';
    const now = Date.now();
    if (player.reloadEndsAt > now) return 'already_reloading';
    if (weapon.ammoInMag >= weapon.definition.magazineSize) return 'magazine_full';
    if (reserveFor(player, weapon) <= 0) return 'no_reserve';

    const duration =
      (weapon.definition.reloadTimeSeconds / player.perks.reloadSpeedMultiplier) * 1000;
    player.reloadEndsAt = now + duration;
    player.schema.reloading = true;
    player.consecutiveShots = 0;
    return null;
  }

  /** Completes any reload or heal whose timer has elapsed. */
  update(player: RaidPlayer): void {
    const now = Date.now();
    if (player.schema.reloading && player.reloadEndsAt <= now) {
      const weapon = activeWeapon(player);
      if (weapon) {
        const needed = weapon.definition.magazineSize - weapon.ammoInMag;
        weapon.ammoInMag += consumeReserve(player, weapon, needed);
      }
      player.schema.reloading = false;
      syncWeaponState(player);
    }
  }

  /** Swap between the primary and secondary weapon. */
  handleEquip(player: RaidPlayer, slot: 'primary' | 'secondary'): string | null {
    if (!isAlive(player)) return 'not_alive';
    if (!player.weapons[slot]) return 'empty_slot';
    if (player.activeSlot === slot) return null;
    player.activeSlot = slot;
    player.schema.reloading = false;
    player.reloadEndsAt = 0;
    player.consecutiveShots = 0;
    syncWeaponState(player);
    return null;
  }
}

/** Human-readable name for an AI archetype, used in the kill feed. */
export function aiDisplayName(archetype: string): string {
  switch (archetype) {
    case 'guard':
      return 'QZ GUARD';
    case 'heavy':
      return 'QZ HEAVY';
    default:
      return 'SCAVENGER';
  }
}
