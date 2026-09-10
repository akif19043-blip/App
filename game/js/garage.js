/**
 * Garage rules: what a car actually performs like once its parts and paint
 * are taken into account, and what the next part costs.
 *
 * The rest of the game only ever sees the tuned spec, so nothing downstream
 * has to know upgrades exist.
 */

import * as save from './save.js';
import { PLAY, UPGRADES } from './config.js';

/** Cost of taking `partId` on `car` from its current level to the next. */
export function upgradeCost(car, partId) {
  const part = UPGRADES.find((entry) => entry.id === partId);
  if (!part) return null;
  const level = save.upgradeLevel(car.id, partId);
  if (level >= part.levels) return null;         // fully fitted
  return part.basePrice * (level + 1);
}

export function upgradeState(car) {
  return UPGRADES.map((part) => ({
    ...part,
    level: save.upgradeLevel(car.id, part.id),
    cost: upgradeCost(car, part.id),
  }));
}

/**
 * @returns {boolean} true if the part was bought
 */
export function buyUpgrade(car, partId) {
  const cost = upgradeCost(car, partId);
  if (cost === null) return false;
  const profile = save.get();
  if (profile.coins < cost) return false;
  save.addCoins(-cost);
  save.setUpgradeLevel(car.id, partId, save.upgradeLevel(car.id, partId) + 1);
  return true;
}

/**
 * What it costs to put this car right, rounded to something a player can
 * read. Zero when there is nothing to fix.
 */
export function repairCost(car) {
  const damage = save.damageFor(car.id);
  if (damage < 0.02) return 0;
  return Math.max(40, Math.round(damage * PLAY.repairCost / 10) * 10);
}

/**
 * Pay for the repair. Returns false, changing nothing, when the car is either
 * already straight or the money is not there.
 */
export function repair(car) {
  const cost = repairCost(car);
  if (!cost || save.get().coins < cost) return false;
  save.addCoins(-cost);
  save.setDamage(car.id, 0);
  return true;
}

export function paint(car) {
  return save.paintFor(car.id, car.paint);
}

export function setPaint(car, color) {
  save.setPaint(car.id, color);
}

/**
 * The car as it currently drives: base spec, scaled by whatever is fitted.
 * `brakeScale` starts at 1 and only upgrades move it.
 */
export function tunedSpec(car) {
  const tuned = { ...car, paint: paint(car), brakeScale: 1,
                  payMultiplier: car.payMultiplier || 1 };
  for (const part of UPGRADES) {
    const level = save.upgradeLevel(car.id, part.id);
    if (!level) continue;
    const base = tuned[part.stat] !== undefined ? tuned[part.stat] : 1;
    tuned[part.stat] = base * (1 + part.perLevel * level);
  }
  return tuned;
}

/** 0..1 how far through its upgrade path a car is -- for the garage bars. */
export function tuneFraction(car) {
  let level = 0;
  let total = 0;
  for (const part of UPGRADES) {
    level += save.upgradeLevel(car.id, part.id);
    total += part.levels;
  }
  return total ? level / total : 0;
}
