import { DEFAULT_GAME_CONFIG } from './config.js';
import { getItem } from './catalog.js';
import { Rarity } from './enums.js';

/**
 * Vendor pricing. The buy price is the item's `value`; the sell price is a
 * configurable ratio of it, with a small per-rarity modifier so that dumping
 * legendary loot still feels worthwhile.
 */
export const RARITY_SELL_MODIFIER: Readonly<Record<Rarity, number>> = {
  [Rarity.Common]: 0.95,
  [Rarity.Uncommon]: 1,
  [Rarity.Rare]: 1.05,
  [Rarity.Epic]: 1.1,
  [Rarity.Legendary]: 1.15,
};

export function buyPrice(itemId: string, quantity = 1): number {
  const def = getItem(itemId);
  if (!def) return 0;
  return Math.max(0, Math.round(def.value * quantity));
}

export function sellPrice(
  itemId: string,
  quantity = 1,
  sellRatio = DEFAULT_GAME_CONFIG.vendorSellRatio,
): number {
  const def = getItem(itemId);
  if (!def) return 0;
  const modifier = RARITY_SELL_MODIFIER[def.rarity];
  return Math.max(0, Math.round(def.value * sellRatio * modifier * quantity));
}

export interface TransactionResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly creditsAfter: number;
  readonly totalPrice: number;
}

/** Pure validation of a purchase. The server applies it inside a transaction. */
export function validatePurchase(
  credits: number,
  itemId: string,
  quantity: number,
): TransactionResult {
  const def = getItem(itemId);
  if (!def) {
    return { ok: false, reason: 'unknown_item', creditsAfter: credits, totalPrice: 0 };
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
    return { ok: false, reason: 'invalid_quantity', creditsAfter: credits, totalPrice: 0 };
  }
  if (!def.tradable) {
    return { ok: false, reason: 'not_tradable', creditsAfter: credits, totalPrice: 0 };
  }
  const totalPrice = buyPrice(itemId, quantity);
  if (totalPrice > credits) {
    return { ok: false, reason: 'insufficient_credits', creditsAfter: credits, totalPrice };
  }
  return { ok: true, creditsAfter: credits - totalPrice, totalPrice };
}

export function validateSale(
  credits: number,
  itemId: string,
  quantity: number,
  sellRatio = DEFAULT_GAME_CONFIG.vendorSellRatio,
): TransactionResult {
  const def = getItem(itemId);
  if (!def) {
    return { ok: false, reason: 'unknown_item', creditsAfter: credits, totalPrice: 0 };
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
    return { ok: false, reason: 'invalid_quantity', creditsAfter: credits, totalPrice: 0 };
  }
  if (!def.tradable) {
    return { ok: false, reason: 'not_tradable', creditsAfter: credits, totalPrice: 0 };
  }
  const totalPrice = sellPrice(itemId, quantity, sellRatio);
  return { ok: true, creditsAfter: credits + totalPrice, totalPrice };
}

/** Items the NPC vendor always keeps in stock. */
export const VENDOR_STOCK: readonly string[] = [
  'pm9',
  'vx7',
  'ar12',
  'breach8',
  'm14x',
  'armor_light_vest',
  'armor_tactical_rig',
  'armor_heavy_plate',
  'bandage',
  'medical_kit',
  'combat_stim',
  'ammo_light',
  'ammo_medium',
  'ammo_heavy',
  'ammo_shell',
  'duct_tape',
];
