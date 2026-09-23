import { type EnemyDef, ENEMIES } from '../game/enemies';
import { type Poolable } from '../engine/pool';

export class Enemy implements Poolable {
  active = false;
  /** Unique id that survives pool reuse; used for per-target hit tracking. */
  uid = 0;
  def: EnemyDef = ENEMIES.grunt;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  /** Knockback velocity, decays every step. */
  kvx = 0;
  kvy = 0;
  hp = 1;
  maxHp = 1;
  radius = 10;
  speed = 100;
  damage = 5;
  xp = 1;
  /** Hit flash timer (seconds). */
  flash = 0;
  /** Ranged / ability timer. */
  shootCd = 0;
  /** Dash / special timer for elites and bosses. */
  aiTimer = 0;
  dashTime = 0;
  dashX = 0;
  dashY = 0;
  orbHitUntil = 0;
  slowUntil = 0;
  angle = 0;
  wobble = 0;
  name = '';
  finalBoss = false;
}
