/**
 * Gestures first, keyboard second.
 *
 * A swipe anywhere on the play surface becomes one of four actions: left,
 * right, jump, slide. A short tap is `tap` (used to start a run). On desktop
 * the arrow keys / WASD / space do the same. Actions are queued, so a swipe
 * made a few frames before the game polls is not lost.
 */

const SWIPE_MIN = 24;       // px before a drag counts as a swipe
const TAP_MAX_MOVE = 12;
const TAP_MAX_TIME = 350;

const queue = [];
let pointer = null;
let surface = null;

function push(action) {
  if (queue.length < 4) queue.push(action);
}

function onDown(event) {
  if (pointer) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
              t: performance.now(), done: false };
  try { surface.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
}

function onMove(event) {
  if (!pointer || pointer.id !== event.pointerId || pointer.done) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
  pointer.done = true;
  if (Math.abs(dx) > Math.abs(dy)) push(dx > 0 ? 'right' : 'left');
  else push(dy > 0 ? 'slide' : 'jump');
}

function onUp(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (!pointer.done) {
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const dt = performance.now() - pointer.t;
    if (Math.hypot(dx, dy) <= TAP_MAX_MOVE && dt <= TAP_MAX_TIME) push('tap');
  }
  pointer = null;
}

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'slide', KeyS: 'slide',
  Enter: 'tap',
};

function onKey(event) {
  if (event.repeat) return;
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT'
                 || target.tagName === 'BUTTON')) {
    if (event.code !== 'Space' && !event.code.startsWith('Arrow')) return;
  }
  const action = KEYS[event.code];
  if (!action) return;
  event.preventDefault();
  push(action);
}

export function init(element) {
  surface = element;
  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);
  surface.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
}

/** Take the next queued action, or null. */
export function poll() {
  return queue.length ? queue.shift() : null;
}

export function clear() {
  queue.length = 0;
}

/** Programmatic action (tests, on-screen hints). */
export function inject(action) {
  push(action);
}
