import { clamp, damp } from '../engine/math';

export const PLAYER_RADIUS = 14;

export class Player {
  x = 0;
  y = 0;
  /** Position at the previous physics step, for render interpolation. */
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  hp = 100;
  radius = PLAYER_RADIUS;
  /** Seconds of invulnerability left after being hit. */
  invuln = 0;
  /** Facing angle in radians (last movement direction). */
  facing = -Math.PI / 2;
  /** Distance walked, drives the idle/move animation. */
  stride = 0;

  reset(x: number, y: number, hp: number): void {
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = this.vy = 0;
    this.hp = hp;
    this.invuln = 0;
    this.facing = -Math.PI / 2;
    this.stride = 0;
  }

  /** Smoothly accelerates towards `speed * (ix, iy)` and clamps to the arena. */
  move(ix: number, iy: number, speed: number, dt: number, arenaW: number, arenaH: number): void {
    this.px = this.x;
    this.py = this.y;
    const k = damp(14, dt);
    this.vx += (ix * speed - this.vx) * k;
    this.vy += (iy * speed - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const r = this.radius;
    const cx = clamp(this.x, r, arenaW - r);
    const cy = clamp(this.y, r, arenaH - r);
    if (cx !== this.x) this.vx = 0;
    if (cy !== this.y) this.vy = 0;
    this.x = cx;
    this.y = cy;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 20) this.facing = Math.atan2(this.vy, this.vx);
    this.stride += sp * dt;
  }
}
