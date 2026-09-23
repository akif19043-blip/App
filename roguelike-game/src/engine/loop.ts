/**
 * Fixed-timestep game loop (Glenn Fiedler's "Fix Your Timestep").
 * Physics always advances in exact STEP increments; rendering receives the
 * interpolation factor between the previous and current physics state.
 */
export const STEP = 1 / 60;
const MAX_FRAME = 0.25; // avoid the spiral of death after a stall
const MAX_STEPS = 8;

export class GameLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const frame = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > MAX_FRAME) dt = MAX_FRAME;
      if (dt < 0) dt = 0;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
      this.render(this.acc / STEP, dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
