import { type Poolable } from '../engine/pool';

export type PickupKind = 'xp' | 'gold' | 'heal' | 'vacuum' | 'chest';

export class Pickup implements Poolable {
  active = false;
  kind: PickupKind = 'xp';
  value = 1;
  x = 0;
  y = 0;
  /** Being pulled towards the player. Once set it stays set. */
  magnet = false;
  speed = 0;
  /** Random phase for the idle bob animation. */
  phase = 0;
  /** Scatter velocity right after dropping. */
  vx = 0;
  vy = 0;
}

/** Visual tier of an XP gem from its value. */
export function gemTier(value: number): 0 | 1 | 2 | 3 {
  if (value >= 100) return 3;
  if (value >= 20) return 2;
  if (value >= 5) return 1;
  return 0;
}
