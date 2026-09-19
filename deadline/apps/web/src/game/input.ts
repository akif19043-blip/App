/**
 * Raw input capture.
 *
 * Keyboard state is polled by the game loop (not event-driven) so a frame's
 * input is a consistent snapshot. Mouse look uses pointer lock; when the
 * pointer is unlocked — inventory open, tab away — look input is ignored but
 * movement keys keep working, which is what stops the character freezing
 * mid-fight when a menu opens.
 */
export interface InputFrame {
  forward: number;
  right: number;
  sprint: boolean;
  crouch: boolean;
  ads: boolean;
  firing: boolean;
  yawDelta: number;
  pitchDelta: number;
}

export type InputAction =
  | 'reload'
  | 'interact'
  | 'loot'
  | 'inventory'
  | 'weapon1'
  | 'weapon2'
  | 'extract'
  | 'escape'
  | 'debug'
  | 'map';

export interface InputOptions {
  sensitivity: number;
  invertY: boolean;
  onAction(action: InputAction): void;
}

export class InputController {
  private readonly element: HTMLElement;
  private readonly keys = new Set<string>();
  private readonly options: InputOptions;
  private accumulatedYaw = 0;
  private accumulatedPitch = 0;
  private mouseDown = false;
  private rightMouseDown = false;
  private pointerLocked = false;
  private disposed = false;

  constructor(element: HTMLElement, options: InputOptions) {
    this.element = element;
    this.options = options;
    this.attach();
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  requestPointerLock(): void {
    if (this.pointerLocked || this.disposed) return;
    void this.element.requestPointerLock?.();
  }

  releasePointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement === this.element) {
      document.exitPointerLock();
    }
  }

  /** Consume the accumulated input for this frame. */
  sample(): InputFrame {
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const right = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const frame: InputFrame = {
      forward,
      right,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crouch: this.keys.has('KeyC'),
      ads: this.rightMouseDown,
      firing: this.mouseDown,
      yawDelta: this.accumulatedYaw,
      pitchDelta: this.accumulatedPitch,
    };
    this.accumulatedYaw = 0;
    this.accumulatedPitch = 0;
    return frame;
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.element.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
  }

  private attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.element.addEventListener('mousemove', this.onMouseMove);
    this.element.addEventListener('contextmenu', this.onContextMenu);
  }

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    // Let the browser keep its own shortcuts.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    this.keys.add(event.code);

    switch (event.code) {
      case 'KeyR':
        this.options.onAction('reload');
        break;
      case 'KeyE':
        this.options.onAction('interact');
        break;
      case 'KeyF':
        this.options.onAction('loot');
        break;
      case 'Tab':
        event.preventDefault();
        this.options.onAction('inventory');
        break;
      case 'Digit1':
        this.options.onAction('weapon1');
        break;
      case 'Digit2':
        this.options.onAction('weapon2');
        break;
      case 'KeyX':
        this.options.onAction('extract');
        break;
      case 'KeyM':
        this.options.onAction('map');
        break;
      case 'Escape':
        this.options.onAction('escape');
        break;
      case 'Backquote':
        this.options.onAction('debug');
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.mouseDown = false;
    this.rightMouseDown = false;
  };

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.element;
    if (!this.pointerLocked) {
      this.mouseDown = false;
      this.rightMouseDown = false;
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      this.requestPointerLock();
      return;
    }
    if (event.button === 0) this.mouseDown = true;
    if (event.button === 2) this.rightMouseDown = true;
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.mouseDown = false;
    if (event.button === 2) this.rightMouseDown = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return;
    const scale = this.options.sensitivity * 0.0022;
    this.accumulatedYaw -= event.movementX * scale;
    this.accumulatedPitch += (this.options.invertY ? 1 : -1) * event.movementY * scale;
  };
}
