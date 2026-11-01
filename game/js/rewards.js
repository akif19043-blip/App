/**
 * What watching an ad is worth, and when it may be offered.
 *
 * Kept apart from ads.js, which only knows whether an ad can be shown, and
 * from main.js, which only knows when to ask. Everything here is a rule about
 * the game's economy, the same way garage.js holds the rules for parts.
 */

import * as save from './save.js';
import * as progress from './progress.js';
import { ADS } from './config.js';

/**
 * The menu bonus. It grows with rank alongside every job fee, so a
 * top-ranked driver is not offered pocket money.
 */
export function freeCoinsAmount(xp = save.get().xp || 0) {
  return Math.round(ADS.freeCoins * progress.payRate(xp) / 10) * 10;
}

/** Seconds until the menu bonus can be offered again; 0 when it can now. */
export function freeCoinsWait(now = Date.now()) {
  const last = save.adClaimedAt('coins');
  if (!last) return 0;
  const left = ADS.freeCoinsCooldown - (now - last) / 1000;
  // A clock wound backwards would otherwise lock the bonus away for good.
  return left > ADS.freeCoinsCooldown ? 0 : Math.max(0, left);
}

/** Pay the menu bonus. Returns what was paid, or 0 if it was not due. */
export function claimFreeCoins(now = Date.now()) {
  if (freeCoinsWait(now) > 0) return 0;
  const amount = freeCoinsAmount();
  save.addCoins(amount);
  save.markAdClaimed('coins', now);
  return amount;
}

/** Put a car right for nothing. False when there was nothing to fix. */
export function freeRepair(car) {
  if (save.damageFor(car.id) < 0.02) return false;
  save.setDamage(car.id, 0);
  save.markAdClaimed('repair');
  return true;
}
