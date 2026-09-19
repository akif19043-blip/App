import { MOVEMENT } from '@deadline/shared';
import type { CollisionWorld } from './collision.js';

/** Mutable movement state. The client keeps a copy for prediction. */
export interface MovementState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  stamina: number;
  /** Seconds since the player last sprinted, gating stamina regeneration. */
  staminaIdle: number;
  crouching: boolean;
  sprinting: boolean;
}

export interface MovementInput {
  /** -1 (back) … 1 (forward) in the player's own frame. */
  forward: number;
  /** -1 (left) … 1 (right). */
  right: number;
  yaw: number;
  sprint: boolean;
  crouch: boolean;
  ads: boolean;
  dt: number;
}

export interface MovementModifiers {
  /** Perk-driven sprint bonus, 1 = no bonus. */
  sprintSpeedMultiplier: number;
  /** Set to false to freeze a player (dead, extracting, deploying). */
  canMove: boolean;
}

export const DEFAULT_MOVEMENT_MODIFIERS: MovementModifiers = {
  sprintSpeedMultiplier: 1,
  canMove: true,
};

export function createMovementState(x: number, z: number): MovementState {
  return {
    x,
    y: 0,
    z,
    vx: 0,
    vz: 0,
    stamina: MOVEMENT.maxStamina,
    staminaIdle: MOVEMENT.staminaRegenDelay,
    crouching: false,
    sprinting: false,
  };
}

/** Maximum ground speed for the current stance, before perks. */
export function targetSpeed(input: MovementInput, canSprint: boolean): number {
  if (input.crouch) return MOVEMENT.crouchSpeed;
  let speed: number = MOVEMENT.walkSpeed;
  if (input.sprint && canSprint && input.forward > 0.1) speed = MOVEMENT.sprintSpeed;
  if (input.ads) speed *= MOVEMENT.adsSpeedMultiplier;
  return speed;
}

/**
 * One deterministic movement step.
 *
 * Both the client predictor and the authoritative server call this with the
 * same input frame, the same collision world and the same modifiers, so their
 * results only differ by floating-point noise.
 */
export function stepMovement(
  state: MovementState,
  input: MovementInput,
  world: CollisionWorld,
  modifiers: MovementModifiers = DEFAULT_MOVEMENT_MODIFIERS,
): MovementState {
  const dt = Math.max(0, Math.min(0.25, input.dt));
  if (dt === 0) return state;

  const wantsSprint =
    modifiers.canMove &&
    input.sprint &&
    !input.crouch &&
    input.forward > 0.1 &&
    state.stamina > (state.sprinting ? 0 : MOVEMENT.minStaminaToSprint);

  state.sprinting = wantsSprint && state.stamina > 0;
  state.crouching = input.crouch;

  if (state.sprinting) {
    state.stamina = Math.max(0, state.stamina - MOVEMENT.staminaDrainPerSecond * dt);
    state.staminaIdle = 0;
  } else {
    state.staminaIdle += dt;
    if (state.staminaIdle >= MOVEMENT.staminaRegenDelay) {
      state.stamina = Math.min(
        MOVEMENT.maxStamina,
        state.stamina + MOVEMENT.staminaRegenPerSecond * dt,
      );
    }
  }

  let speed = targetSpeed(input, state.sprinting);
  if (state.sprinting) speed *= modifiers.sprintSpeedMultiplier;
  if (!modifiers.canMove) speed = 0;

  // Input axes are in the player's frame; rotate them into world space.
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wishX = input.right * cos - input.forward * sin;
  let wishZ = input.right * sin + input.forward * cos;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 1) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }

  const desiredVx = wishX * speed;
  const desiredVz = wishZ * speed;
  const accel = wishLength > 0.01 ? MOVEMENT.acceleration : MOVEMENT.friction;
  const blend = Math.min(1, accel * dt);
  state.vx += (desiredVx - state.vx) * blend;
  state.vz += (desiredVz - state.vz) * blend;

  if (Math.abs(state.vx) < 1e-3) state.vx = 0;
  if (Math.abs(state.vz) < 1e-3) state.vz = 0;

  const nextX = state.x + state.vx * dt;
  const nextZ = state.z + state.vz * dt;
  const height = state.crouching ? MOVEMENT.crouchHeight : MOVEMENT.playerHeight;
  const resolved = world.resolveCircle(nextX, nextZ, MOVEMENT.playerRadius, state.y, height);

  // Kill velocity along an axis we were pushed back on, so we slide instead of
  // vibrating against the wall.
  if (Math.abs(resolved.x - nextX) > 1e-4) state.vx = 0;
  if (Math.abs(resolved.z - nextZ) > 1e-4) state.vz = 0;

  state.x = resolved.x;
  state.z = resolved.z;
  return state;
}

/**
 * Anti-cheat: the furthest a player could legitimately travel in `dt`.
 * Anything beyond this (plus tolerance) is reported as a suspicious event and
 * the server's own position wins.
 */
export function maxLegalDistance(dt: number, sprintSpeedMultiplier = 1): number {
  const topSpeed = MOVEMENT.sprintSpeed * sprintSpeedMultiplier;
  return topSpeed * Math.max(0, Math.min(0.25, dt)) + MOVEMENT.antiCheatPositionTolerance;
}
