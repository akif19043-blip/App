import { type Poolable } from '../engine/pool';
import { type WeaponId } from '../weapons/defs';

const MAX_HITS = 12;

export class Projectile implements Poolable {
  active = false;
  weapon: WeaponId = 'wand';
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  radius = 6;
  damage = 10;
  pierce = 0;
  bounces = 0;
  knockback = 0;
  life = 1;
  spin = 0;
  /** uids of enemies already hit, so piercing shots never double-hit. */
  readonly hits = new Int32Array(MAX_HITS);
  hitCount = 0;

  hasHit(uid: number): boolean {
    const n = Math.min(this.hitCount, MAX_HITS);
    for (let i = 0; i < n; i++) if (this.hits[i] === uid) return true;
    return false;
  }

  markHit(uid: number): void {
    this.hits[this.hitCount % MAX_HITS] = uid;
    this.hitCount++;
  }
}

export class EnemyBullet implements Poolable {
  active = false;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  radius = 7;
  damage = 8;
  life = 4;
  /** Who fired it, for the death screen. */
  source = '';
}
