/**
 * Vibration feedback.
 *
 * navigator.vibrate is absent on iOS and can be blocked by the browser, so
 * every call is guarded and failure is silent -- feedback is a bonus, never
 * something the game depends on.
 */

let enabled = true;

export function setEnabled(value) {
  enabled = !!value;
}

export function isEnabled() {
  return enabled;
}

function buzz(pattern) {
  if (!enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (err) { /* blocked by the browser; nothing to do */ }
}

/** A light tick for pickups. */
export function pickup() {
  buzz(12);
}

/** A firm double knock for a crash. */
export function crash() {
  buzz([28, 40, 60]);
}

/** A short rumble for scraping a wall. */
export function scrape() {
  buzz(16);
}

/** A rising pair for finishing a delivery. */
export function reward() {
  buzz([18, 50, 28]);
}
