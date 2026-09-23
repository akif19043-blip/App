import { clamp, damp } from './math';

/** Follow camera with trauma-based screen shake. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 800;
  viewH = 600;
  private trauma = 0;
  shakeX = 0;
  shakeY = 0;
  private t = 0;

  /** Adds screen shake; trauma is clamped to [0, 1]. */
  shake(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  follow(tx: number, ty: number, dt: number, snap = false): void {
    const k = snap ? 1 : damp(10, dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  update(dt: number, enabled: boolean): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = enabled ? this.trauma * this.trauma * 18 : 0;
    // Cheap pseudo-noise from incommensurate sines.
    this.shakeX = s * Math.sin(this.t * 71.3) * Math.cos(this.t * 23.9);
    this.shakeY = s * Math.sin(this.t * 53.1 + 1.7) * Math.cos(this.t * 31.7);
  }

  get left(): number {
    return this.x - this.viewW / 2;
  }

  get top(): number {
    return this.y - this.viewH / 2;
  }

  /** True when the point (with radius margin) is inside the visible region. */
  sees(x: number, y: number, margin: number): boolean {
    return (
      x > this.x - this.viewW / 2 - margin &&
      x < this.x + this.viewW / 2 + margin &&
      y > this.y - this.viewH / 2 - margin &&
      y < this.y + this.viewH / 2 + margin
    );
  }
}
