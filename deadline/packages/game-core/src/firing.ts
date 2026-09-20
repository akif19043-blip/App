import { shotIntervalSeconds, type WeaponDefinition } from '@deadline/shared';

/**
 * Client-side trigger gating.
 *
 * The server is the authority on whether a shot counts, but the client still
 * has to decide when to *ask* — otherwise a held mouse button would spam the
 * socket with requests a semi-automatic weapon can never honour.
 *
 * Kept here, as a pure function, because the rule is subtle: an automatic
 * weapon keeps firing while the trigger is held, a semi-automatic one needs the
 * trigger released and pulled again, and both respect the weapon's cyclic rate.
 */
export interface TriggerState {
  /** Timestamp (ms) of the last shot request. */
  lastShotAt: number;
  /** True once a semi-automatic shot has been taken and the trigger not yet released. */
  triggerHeld: boolean;
  /** Consecutive shots, for recoil and spread ramp-up. */
  consecutiveShots: number;
}

export function createTriggerState(): TriggerState {
  return { lastShotAt: 0, triggerHeld: false, consecutiveShots: 0 };
}

export interface TriggerInput {
  readonly weapon: WeaponDefinition;
  /** Is the fire button down this frame? */
  readonly firing: boolean;
  /** Monotonic clock in milliseconds. */
  readonly now: number;
}

/**
 * Advance the trigger by one frame, mutating `state`.
 * Returns true when the client should send a fire request.
 */
export function pullTrigger(state: TriggerState, input: TriggerInput): boolean {
  if (!input.firing) {
    // Releasing the trigger re-arms a semi-automatic weapon and lets the
    // recoil pattern settle.
    state.triggerHeld = false;
    if (input.now - state.lastShotAt > 400) state.consecutiveShots = 0;
    return false;
  }

  // A semi-automatic weapon fires once per pull, no matter how long you hold.
  if (!input.weapon.automatic && state.triggerHeld) return false;

  const interval = shotIntervalSeconds(input.weapon) * 1000;
  if (state.lastShotAt > 0 && input.now - state.lastShotAt < interval) return false;

  state.lastShotAt = input.now;
  state.triggerHeld = true;
  state.consecutiveShots = Math.min(40, state.consecutiveShots + 1);
  return true;
}
