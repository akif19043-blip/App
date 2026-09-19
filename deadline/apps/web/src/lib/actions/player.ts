'use server';

import { revalidatePath } from 'next/cache';
import {
  AnalyticsEvent,
  DAILY_MISSION_POOL,
  DEFAULT_GAME_CONFIG,
  dailyResetKey,
  track,
} from '@deadline/shared';
import { getPersistence } from '../persistence';
import { requireSessionUser } from '../session';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Buy from the NPC vendor. Price and balance are validated server side. */
export async function buyItem(itemId: string, quantity: number): Promise<ActionResult> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const result = await persistence.marketBuy(user.id, itemId, quantity);
  if (result.ok) {
    track(AnalyticsEvent.MarketPurchase, {
      player_id: user.id,
      item_id: itemId,
      quantity,
      total: result.totalPrice,
    });
  }
  revalidatePath('/market');
  revalidatePath('/stash');
  return {
    ok: result.ok,
    message: result.ok
      ? `Purchased ${quantity} × ${itemId} for ${result.totalPrice} credits.`
      : (result.reason ?? 'Purchase failed.'),
  };
}

/** Sell a stash stack back to the vendor. */
export async function sellItem(entryId: string, quantity: number): Promise<ActionResult> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const result = await persistence.marketSell(user.id, entryId, quantity);
  if (result.ok) {
    track(AnalyticsEvent.MarketSale, {
      player_id: user.id,
      entry_id: entryId,
      quantity,
      total: result.totalPrice,
    });
  }
  revalidatePath('/market');
  revalidatePath('/stash');
  return {
    ok: result.ok,
    message: result.ok
      ? `Sold for ${result.totalPrice} credits.`
      : (result.reason ?? 'Sale failed.'),
  };
}

export async function saveLoadout(patch: {
  primaryWeaponId?: string | null;
  secondaryWeaponId?: string | null;
  armorItemId?: string | null;
  perkIds?: string[];
}): Promise<ActionResult> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  await persistence.saveLoadout(user.id, {
    ...patch,
    ...(patch.perkIds ? { perkIds: patch.perkIds.slice(0, DEFAULT_GAME_CONFIG.perkSlots) } : {}),
  });
  revalidatePath('/loadout');
  return { ok: true, message: 'Loadout saved.' };
}

/** Move a stash stack into (or out of) the pre-packed raid backpack. */
export async function setInventoryContainer(
  entryId: string,
  container: 'stash' | 'loadout_backpack' | 'loadout_secure',
): Promise<ActionResult> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  try {
    await persistence.moveInventoryContainer(user.id, entryId, container);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Move failed.' };
  }
  revalidatePath('/stash');
  revalidatePath('/loadout');
  return { ok: true, message: 'Moved.' };
}

export async function claimMission(playerMissionId: string): Promise<ActionResult> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const result = await persistence.claimMission(user.id, playerMissionId);
  if (result.ok) {
    track(AnalyticsEvent.MissionCompleted, { player_id: user.id, mission: playerMissionId });
  }
  revalidatePath('/missions');
  return {
    ok: result.ok,
    message: result.ok ? `Claimed ${result.totalPrice} credits.` : (result.reason ?? 'Claim failed.'),
  };
}

/** Ensures today's three daily missions exist for this operator. */
export async function ensureDailies(): Promise<void> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  await persistence.ensureDailyMissions(
    user.id,
    dailyResetKey(),
    DAILY_MISSION_POOL.map((mission) => mission.id),
  );
}

export async function completeTutorial(): Promise<void> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  await persistence.setTutorialDone(user.id);
  revalidatePath('/menu');
}
