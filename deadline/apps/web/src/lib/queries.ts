import 'server-only';
import {
  DAILY_MISSION_POOL,
  MISSION_DEFINITIONS,
  VENDOR_STOCK,
  dailyResetKey,
  getAnyMission,
  getItem,
  levelProgress,
  type MissionDefinition,
} from '@deadline/shared';
import { availableMissions } from '@deadline/game-core';
import type { InventoryRow, LeaderboardEntry, MissionRow } from '@deadline/persistence';
import { getPersistence } from './persistence';
import { requireSessionUser, type SessionUser } from './session';

export interface OperatorOverview {
  user: SessionUser;
  profile: {
    username: string;
    level: number;
    xp: number;
    credits: number;
    tutorialDone: boolean;
  };
  progress: ReturnType<typeof levelProgress>;
  stats: {
    raids: number;
    successfulExtractions: number;
    deaths: number;
    playerKills: number;
    aiKills: number;
    lootExtractedValue: number;
    damageDealt: number;
    playtimeSeconds: number;
  };
}

/** Everything the menu header needs, in one round trip. */
export async function loadOperator(): Promise<OperatorOverview> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const profile = await persistence.ensureProfile(user.id, user.username);
  const stats = await persistence.getStats(user.id);

  return {
    user,
    profile: {
      username: profile.username,
      level: profile.level,
      xp: profile.xp,
      credits: profile.credits,
      tutorialDone: profile.tutorialDone,
    },
    progress: levelProgress(profile.xp),
    stats: {
      raids: stats.raids,
      successfulExtractions: stats.successfulExtractions,
      deaths: stats.deaths,
      playerKills: stats.playerKills,
      aiKills: stats.aiKills,
      lootExtractedValue: stats.lootExtractedValue,
      damageDealt: stats.damageDealt,
      playtimeSeconds: stats.playtimeSeconds,
    },
  };
}

export interface StashView {
  rows: (InventoryRow & { name: string; rarity: string; value: number; icon: string })[];
  totalValue: number;
}

export async function loadStash(container?: 'stash' | 'loadout_backpack' | 'loadout_secure'): Promise<StashView> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const rows = await persistence.listInventory(user.id, container);
  const decorated = rows.map((row) => {
    const definition = getItem(row.itemId);
    return {
      ...row,
      name: definition?.name ?? row.itemId,
      rarity: definition?.rarity ?? 'common',
      value: (definition?.value ?? 0) * row.quantity,
      icon: definition?.icon ?? 'box',
    };
  });
  return {
    rows: decorated,
    totalValue: decorated.reduce((total, row) => total + row.value, 0),
  };
}

export async function loadLoadout() {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const [loadout, inventory] = await Promise.all([
    persistence.getActiveLoadout(user.id),
    persistence.listInventory(user.id),
  ]);
  return {
    loadout:
      loadout ?? {
        id: 'pending',
        playerId: user.id,
        name: 'Default',
        primaryWeaponId: null,
        secondaryWeaponId: null,
        armorItemId: null,
        perkIds: [] as string[],
      },
    inventory,
  };
}

export interface MissionView {
  definition: MissionDefinition;
  row: MissionRow | null;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export async function loadMissions(): Promise<{ campaign: MissionView[]; daily: MissionView[] }> {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const profile = await persistence.ensureProfile(user.id, user.username);

  const resetKey = dailyResetKey();
  await persistence.ensureDailyMissions(
    user.id,
    resetKey,
    DAILY_MISSION_POOL.map((mission) => mission.id),
  );
  const rows = await persistence.listMissions(user.id);
  const byMission = new Map(rows.map((row) => [`${row.missionId}:${row.resetKey ?? '-'}`, row]));

  const completedIds = rows.filter((row) => row.completed).map((row) => row.missionId);
  const campaignDefinitions = availableMissions(
    MISSION_DEFINITIONS,
    profile.level,
    completedIds,
  );

  const campaign = campaignDefinitions.map((definition) => {
    const row = byMission.get(`${definition.id}:-`) ?? null;
    return {
      definition,
      row,
      progress: row?.progress ?? 0,
      completed: row?.completed ?? false,
      claimed: row?.claimedAt !== null && row?.claimedAt !== undefined,
    };
  });

  const daily = rows
    .filter((row) => row.daily && row.resetKey === resetKey)
    .flatMap<MissionView>((row) => {
      const definition = getAnyMission(row.missionId);
      if (!definition) return [];
      return [
        {
          definition,
          row,
          progress: row.progress,
          completed: row.completed,
          claimed: row.claimedAt !== null,
        },
      ];
    });

  return { campaign, daily };
}

export async function loadMarket() {
  const [operator, stash] = await Promise.all([loadOperator(), loadStash('stash')]);
  const stock = VENDOR_STOCK.map((itemId) => getItem(itemId)).filter(
    (item): item is NonNullable<typeof item> => item !== undefined,
  );
  return { operator, stash, stock };
}

export async function loadLeaderboard(metric: 'loot' | 'kills' | 'extracts') {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  const [entries, rank] = await Promise.all([
    persistence.leaderboard(metric, 100),
    persistence.leaderboardRank(user.id, metric),
  ]);
  return { entries: entries as LeaderboardEntry[], rank, userId: user.id };
}

export async function loadRaidHistory(limit = 15) {
  const user = await requireSessionUser();
  const persistence = await getPersistence();
  return persistence.listRaidHistory(user.id, limit);
}
