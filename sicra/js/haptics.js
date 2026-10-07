/**
 * Vibration feedback. navigator.vibrate is missing on iOS and can be blocked,
 * so every call is guarded and silent on failure.
 */

let enabled = true;

export function setEnabled(value) {
  enabled = !!value;
}

function buzz(pattern) {
  if (!enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (err) { /* blocked; feedback is a bonus */ }
}

export const coin = () => buzz(8);
export const jump = () => buzz(10);
export const slide = () => buzz(10);
export const crash = () => buzz([30, 40, 70]);
export const powerup = () => buzz([15, 40, 25]);
export const near = () => buzz(14);
