/**
 * Keyboard (WASD / arrows) plus a floating virtual joystick for touch.
 * The joystick appears wherever the first touch lands on the play surface.
 */
const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const JOY_RADIUS = 56;
const DEADZONE = 0.12;

export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed: string[] = [];
  touchDetected = false;
  private joyId = -1;
  private joyOx = 0;
  private joyOy = 0;
  private joyX = 0;
  private joyY = 0;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(surface: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    window.addEventListener('keydown', (e) => {
      if (KEY_DIRS[e.code] || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.releaseJoy();
    });

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      this.touchDetected = true;
      document.body.classList.add('touch');
      if (this.joyId !== -1) return;
      this.joyId = e.pointerId;
      this.joyOx = e.clientX;
      this.joyOy = e.clientY;
      this.joyX = 0;
      this.joyY = 0;
      surface.setPointerCapture?.(e.pointerId);
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('on');
      this.drawKnob();
      e.preventDefault();
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      let dx = (e.clientX - this.joyOx) / JOY_RADIUS;
      let dy = (e.clientY - this.joyOy) / JOY_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.joyX = dx;
      this.joyY = dy;
      this.drawKnob();
      e.preventDefault();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.joyId) this.releaseJoy();
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.touchDetected = true;
      document.body.classList.add('touch');
    }
  }

  private drawKnob(): void {
    this.knob.style.transform = `translate(${this.joyX * JOY_RADIUS}px, ${this.joyY * JOY_RADIUS}px)`;
  }

  releaseJoy(): void {
    this.joyId = -1;
    this.joyX = 0;
    this.joyY = 0;
    this.base.classList.remove('on');
  }

  /** Movement intent with length <= 1. */
  axis(out: { x: number; y: number }): void {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const d = KEY_DIRS[code];
      if (d) {
        x += d[0];
        y += d[1];
      }
    }
    x = Math.sign(x);
    y = Math.sign(y);
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      out.x = x / len;
      out.y = y / len;
      return;
    }
    const jl = Math.hypot(this.joyX, this.joyY);
    if (jl > DEADZONE) {
      // Rescale so the deadzone edge maps to zero for smooth ramp-up.
      const s = Math.min(1, (jl - DEADZONE) / (1 - DEADZONE)) / jl;
      out.x = this.joyX * s;
      out.y = this.joyY * s;
      return;
    }
    out.x = 0;
    out.y = 0;
  }

  /** Returns and clears key presses since the last call (for menus/hotkeys). */
  consumePresses(): string[] {
    const p = this.pressed.slice();
    this.pressed.length = 0;
    return p;
  }
}
