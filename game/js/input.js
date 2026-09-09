/**
 * Input for phones first, keyboard as a convenience on desktop.
 *
 * Three steering sources feed one normalised value in [-1, 1]:
 *   - the on-screen arrow pads (hold to steer)
 *   - dragging a thumb anywhere across the play area
 *   - device tilt, when the player turns it on
 *
 * Whichever the player last touched wins, so switching mid-run is seamless.
 */

const state = {
  steer: 0,
  throttle: 0,
  brake: false,
  nitroRequested: false,
  source: 'none',
};

const keys = new Set();
let dragPointer = null;
let dragOrigin = 0;
let dragSteer = 0;
let padSteer = 0;
let tiltSteer = 0;
let tiltEnabled = false;
let tiltZero = null;
let autoThrottle = true;
let padThrottle = 0;
let padBrake = false;

const DRAG_RANGE = 110;      // px of travel for full lock

function pressed(...codes) {
  return codes.some((code) => keys.has(code));
}

/** Bind a button element to a hold-style action. */
function holdButton(el, onDown, onUp) {
  if (!el) return;
  const down = (event) => {
    event.preventDefault();
    el.classList.add('is-active');
    onDown();
  };
  const up = (event) => {
    if (event) event.preventDefault();
    el.classList.remove('is-active');
    onUp();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function init(elements, options = {}) {
  autoThrottle = options.autoThrottle !== false;

  holdButton(elements.left,
    () => { padSteer = -1; state.source = 'pad'; },
    () => { if (padSteer === -1) padSteer = 0; });
  holdButton(elements.right,
    () => { padSteer = 1; state.source = 'pad'; },
    () => { if (padSteer === 1) padSteer = 0; });
  holdButton(elements.brake,
    () => { padBrake = true; }, () => { padBrake = false; });
  holdButton(elements.gas,
    () => { padThrottle = 1; }, () => { padThrottle = 0; });

  if (elements.nitro) {
    elements.nitro.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      state.nitroRequested = true;
    });
  }

  // Drag-to-steer across the whole play surface.
  const surface = elements.surface;
  if (surface) {
    surface.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.control')) return;
      dragPointer = event.pointerId;
      dragOrigin = event.clientX;
      dragSteer = 0;
      state.source = 'drag';
    });
    surface.addEventListener('pointermove', (event) => {
      if (event.pointerId !== dragPointer) return;
      dragSteer = Math.max(-1, Math.min(1,
        (event.clientX - dragOrigin) / DRAG_RANGE));
      state.source = 'drag';
    });
    const release = (event) => {
      if (dragPointer !== null && event.pointerId !== dragPointer) return;
      dragPointer = null;
      dragSteer = 0;
    };
    surface.addEventListener('pointerup', release);
    surface.addEventListener('pointercancel', release);
  }

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      state.nitroRequested = true;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']
        .indexOf(event.code) !== -1) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    padSteer = 0;
    padThrottle = 0;
    padBrake = false;
    dragPointer = null;
    dragSteer = 0;
  });
}

export function setAutoThrottle(value) {
  autoThrottle = value;
}

/**
 * Tilt steering. iOS needs an explicit permission prompt from a user gesture,
 * which is why this returns a promise the settings toggle awaits.
 */
export async function enableTilt() {
  const Ctor = window.DeviceOrientationEvent;
  if (!Ctor) return false;
  if (typeof Ctor.requestPermission === 'function') {
    try {
      const result = await Ctor.requestPermission();
      if (result !== 'granted') return false;
    } catch (err) {
      return false;
    }
  }
  window.addEventListener('deviceorientation', onTilt);
  tiltEnabled = true;
  tiltZero = null;
  return true;
}

export function disableTilt() {
  window.removeEventListener('deviceorientation', onTilt);
  tiltEnabled = false;
  tiltSteer = 0;
}

function onTilt(event) {
  // Portrait: gamma is the left/right roll. Landscape: beta takes over.
  const landscape = Math.abs(window.orientation || 0) === 90;
  const raw = landscape ? (event.beta || 0) : (event.gamma || 0);
  const sign = landscape && (window.orientation === -90) ? -1 : 1;
  if (tiltZero === null) tiltZero = raw;
  const delta = (raw - tiltZero) * sign;
  tiltSteer = Math.max(-1, Math.min(1, delta / 22));
  if (Math.abs(tiltSteer) > 0.06) state.source = 'tilt';
}

export function recentreTilt() {
  tiltZero = null;
}

/** Collapse every source into the frame's input state. */
export function sample() {
  let steer = 0;
  if (pressed('ArrowLeft', 'KeyA')) steer -= 1;
  if (pressed('ArrowRight', 'KeyD')) steer += 1;
  if (steer === 0) {
    if (padSteer !== 0) steer = padSteer;
    else if (dragPointer !== null) steer = dragSteer;
    else if (tiltEnabled) steer = tiltSteer;
  }

  let throttle = autoThrottle ? 1 : padThrottle;
  if (pressed('ArrowUp', 'KeyW')) throttle = 1;

  const brake = padBrake || pressed('Space', 'ArrowDown', 'KeyS');

  state.steer = Math.max(-1, Math.min(1, steer));
  state.throttle = brake ? 0 : throttle;
  state.brake = brake;
  return state;
}

/** Read-and-clear, so a nitro tap fires exactly once. */
export function consumeNitro() {
  const requested = state.nitroRequested;
  state.nitroRequested = false;
  return requested;
}

export function reset() {
  state.steer = 0;
  state.throttle = 0;
  state.brake = false;
  state.nitroRequested = false;
  padSteer = 0;
  padThrottle = 0;
  padBrake = false;
  dragPointer = null;
  dragSteer = 0;
  keys.clear();
}
