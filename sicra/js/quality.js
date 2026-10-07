/**
 * Adaptive quality. Watches frame time and steps DOWN when the phone cannot
 * keep up; never steps back up by itself (that oscillates). The level it
 * settles on is saved so the next launch starts there.
 */

export const LEVELS = [
  { id: 'high', pixelRatio: 2.0, shadows: true, decor: 1.0 },
  { id: 'medium', pixelRatio: 1.5, shadows: false, decor: 0.7 },
  { id: 'low', pixelRatio: 1.0, shadows: false, decor: 0.4 },
];

const TARGET_FRAME = 1 / 28;
const SUSTAIN = 2.5;
const COOLDOWN = 6.0;
const WARMUP = 3.0;

export class Quality {
  constructor(startLevel, onChange) {
    this.index = Math.max(0, LEVELS.findIndex((l) => l.id === startLevel));
    this.onChange = onChange;
    this.reset();
  }

  get level() {
    return LEVELS[this.index];
  }

  reset() {
    this.average = 1 / 60;
    this.slow = 0;
    this.cooldown = COOLDOWN;
    this.warmup = WARMUP;
  }

  set(id) {
    const index = LEVELS.findIndex((l) => l.id === id);
    if (index < 0 || index === this.index) return;
    this.index = index;
    this.reset();
    this.onChange(this.level, false);
  }

  /** Feed one frame's dt. Returns true when the level changed. */
  sample(dt) {
    if (this.warmup > 0) { this.warmup -= dt; return false; }
    this.average += (dt - this.average) * 0.08;
    if (this.cooldown > 0) { this.cooldown -= dt; return false; }
    if (this.average > TARGET_FRAME) this.slow += dt;
    else this.slow = Math.max(0, this.slow - dt * 0.5);
    if (this.slow < SUSTAIN || this.index >= LEVELS.length - 1) return false;
    this.index += 1;
    this.reset();
    this.onChange(this.level, true);
    return true;
  }
}
