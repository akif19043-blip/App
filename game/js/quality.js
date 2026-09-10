/**
 * Adaptive quality.
 *
 * The game ships to phones we cannot test on, so instead of guessing a fixed
 * setting it watches its own frame time and steps down when a device cannot
 * keep up. It only ever steps DOWN automatically -- stepping back up on a
 * brief good patch is how you get a game that oscillates between two bad
 * states. Players can raise anything back by hand in settings.
 *
 * The level it settles on is remembered, so a slow phone does not have to
 * rediscover it on every launch.
 */

export const LEVELS = [
  { id: 'high', pixelRatio: 2.0, shadows: true, pedestrians: 1.0, draw: 1.0 },
  { id: 'medium', pixelRatio: 1.5, shadows: false, pedestrians: 0.6, draw: 0.85 },
  { id: 'low', pixelRatio: 1.0, shadows: false, pedestrians: 0.3, draw: 0.7 },
];

const TARGET_FRAME = 1 / 28;      // below ~28fps for a sustained spell is bad
const SUSTAIN = 2.5;              // seconds of that before acting
const COOLDOWN = 6.0;             // seconds to settle after a change
const WARMUP = 3.0;               // ignore the first frames: shaders, GC, load

export class Quality {
  /**
   * @param {string} startLevel  id to begin at
   * @param {(level:object, auto:boolean)=>void} onChange
   */
  constructor(startLevel, onChange) {
    this.index = Math.max(0, LEVELS.findIndex((l) => l.id === startLevel));
    if (this.index < 0) this.index = 0;
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

  /** Feed one frame. Returns true if the level changed. */
  sample(dt) {
    if (this.warmup > 0) {
      this.warmup -= dt;
      return false;
    }
    // Exponential average: a single hitch should not drop the whole game a
    // level, but a steady struggle should.
    this.average += (dt - this.average) * 0.08;

    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return false;
    }

    if (this.average > TARGET_FRAME) {
      this.slow += dt;
      if (this.slow >= SUSTAIN && this.index < LEVELS.length - 1) {
        this.index += 1;
        this.slow = 0;
        this.cooldown = COOLDOWN;
        this.average = 1 / 45;                 // give the new level a fair look
        if (this.onChange) this.onChange(this.level, true);
        return true;
      }
    } else {
      this.slow = Math.max(0, this.slow - dt * 0.5);
    }
    return false;
  }

  /** Force a level, e.g. from a saved profile or a test. */
  set(id) {
    const index = LEVELS.findIndex((level) => level.id === id);
    if (index < 0 || index === this.index) return false;
    this.index = index;
    this.reset();
    if (this.onChange) this.onChange(this.level, false);
    return true;
  }

  get fps() {
    return this.average > 0 ? 1 / this.average : 0;
  }
}
