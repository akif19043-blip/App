/**
 * Steering: keyboard, a drag-anywhere stick for touch and mouse, a gamepad.
 * There is nothing else to press during a run -- the weapons fire by
 * themselves -- so all of it reduces to one direction vector.
 */

const keys = new Set();
const STICK_RADIUS = 56;      // CSS px a finger travels for full speed
const DEADZONE = 0.18;

let stick = null;             // { id, ox, oy, x, y } while a finger is down
let enabled = false;
let base = null;
let knob = null;

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

/**
 * @param {HTMLElement} surface  where a drag starts the stick
 * @param {{onPause: Function}} handlers
 */
export function init(surface, handlers) {
  base = document.getElementById('stick');
  knob = document.getElementById('stick-knob');

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.code] || event.code === 'Space') {
      // Arrow keys and space would scroll the portal page around the game.
      event.preventDefault();
    }
    if (event.code === 'Escape' || event.code === 'KeyP') handlers.onPause();
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', reset);

  surface.addEventListener('pointerdown', (event) => {
    if (!enabled || stick) return;
    event.preventDefault();
    // Capture keeps the drag ours if the finger slides off the element. It
    // throws for a pointer the browser no longer tracks; the stick works
    // without it, so that is not worth losing the touch over.
    try {
      surface.setPointerCapture(event.pointerId);
    } catch (err) { /* steer uncaptured */ }
    stick = { id: event.pointerId, ox: event.clientX, oy: event.clientY,
              x: event.clientX, y: event.clientY };
    drawStick();
  });
  surface.addEventListener('pointermove', (event) => {
    if (!stick || event.pointerId !== stick.id) return;
    stick.x = event.clientX;
    stick.y = event.clientY;
    // Drag past the rim and the stick follows the finger, so it never pins.
    const dx = stick.x - stick.ox;
    const dy = stick.y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS * 1.4) {
      stick.ox = stick.x - (dx / d) * STICK_RADIUS * 1.4;
      stick.oy = stick.y - (dy / d) * STICK_RADIUS * 1.4;
    }
    drawStick();
  });
  const release = (event) => {
    if (!stick || event.pointerId !== stick.id) return;
    stick = null;
    drawStick();
  };
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);
}

/** Only steer during a run; menus get their taps back. */
export function setEnabled(value) {
  enabled = !!value;
  if (!enabled) reset();
}

export function reset() {
  keys.clear();
  stick = null;
  drawStick();
}

function drawStick() {
  if (!base) return;
  base.classList.toggle('is-visible', !!stick);
  if (!stick) return;
  base.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`;
  const dx = stick.x - stick.ox;
  const dy = stick.y - stick.oy;
  const d = Math.hypot(dx, dy);
  const limit = Math.min(1, STICK_RADIUS / (d || 1));
  knob.style.transform = `translate(${dx * limit}px, ${dy * limit}px)`;
}

/** The direction to fly, length 0..1. */
export function vector() {
  let x = 0;
  let y = 0;
  for (const code of keys) {
    const dir = MOVE_KEYS[code];
    if (dir) {
      x += dir[0];
      y += dir[1];
    }
  }
  if (stick) {
    const dx = (stick.x - stick.ox) / STICK_RADIUS;
    const dy = (stick.y - stick.oy) / STICK_RADIUS;
    const d = Math.hypot(dx, dy);
    if (d > DEADZONE) {
      const scale = Math.min(1, d) / d;
      x += dx * scale;
      y += dy * scale;
    }
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (Math.hypot(ax, ay) > DEADZONE) {
      x += ax;
      y += ay;
    }
    if (pad.buttons[12]?.pressed) y -= 1;
    if (pad.buttons[13]?.pressed) y += 1;
    if (pad.buttons[14]?.pressed) x -= 1;
    if (pad.buttons[15]?.pressed) x += 1;
  }
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  return { x, y };
}
