import { type PlayerStats } from '../game/stats';
import { type ResolvedWeapon, type WeaponId, resolveWeapon } from './defs';

/** A weapon the player owns during a run. */
export class WeaponInstance {
  stats: ResolvedWeapon;
  /** Seconds until the next activation. */
  timer = 0.3;
  /** Remaining shots in the current burst (wand / daggers). */
  burstLeft = 0;
  burstTimer = 0;
  /** Orbit angle for orbs. */
  angle = 0;
  /** Visual pulse in [0, 1] (aura). */
  pulse = 0;
  /** Orb world positions, filled every step for collision and rendering. */
  readonly orbX = new Float32Array(16);
  readonly orbY = new Float32Array(16);
  orbR = 12;

  constructor(readonly id: WeaponId, public level: number, stats: Readonly<PlayerStats>) {
    this.stats = resolveWeapon(id, level, stats);
  }

  refresh(stats: Readonly<PlayerStats>): void {
    this.stats = resolveWeapon(this.id, this.level, stats);
  }
}
