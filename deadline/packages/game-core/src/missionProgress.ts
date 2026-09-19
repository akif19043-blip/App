import { MissionType, getAnyMission, type MissionDefinition } from '@deadline/shared';

/**
 * The minimum a stored mission row must expose for progress folding. The
 * target always comes from the mission definition, never from the row, so a
 * tampered row cannot lower the bar.
 */
export interface MissionProgressInput {
  readonly missionId: string;
  readonly progress: number;
  readonly completed: boolean;
  readonly daily: boolean;
}

/** What one finished raid contributed, from the server's authoritative tally. */
export interface RaidMissionContext {
  readonly extracted: boolean;
  readonly aiKills: number;
  readonly playerKills: number;
  /** Credit value of loot that made it out (0 when the player died). */
  readonly extractedLootValue: number;
  /** itemId → quantity, for loot that made it out. */
  readonly extractedItems: Readonly<Record<string, number>>;
  readonly visitedPoiIds: readonly string[];
}

/** Progress a single raid contributes to a mission. */
export function raidProgressFor(
  mission: MissionDefinition,
  context: RaidMissionContext,
): number {
  const mustExtract = mission.params?.mustExtract ?? false;
  if (mustExtract && !context.extracted) return 0;

  switch (mission.type) {
    case MissionType.KillAI:
      return context.aiKills;
    case MissionType.KillPlayers:
      return context.playerKills;
    case MissionType.Extract:
      return context.extracted ? 1 : 0;
    case MissionType.LootValue:
      return context.extracted ? context.extractedLootValue : 0;
    case MissionType.CollectItem: {
      const itemId = mission.params?.itemId;
      if (!itemId || !context.extracted) return 0;
      return context.extractedItems[itemId] ?? 0;
    }
    case MissionType.VisitLocation: {
      const poiId = mission.params?.poiId;
      if (!poiId) return 0;
      return context.visitedPoiIds.includes(poiId) ? 1 : 0;
    }
    default:
      return 0;
  }
}

export interface MissionUpdate {
  readonly missionId: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly justCompleted: boolean;
  readonly daily: boolean;
}

/**
 * Fold a finished raid into the player's mission rows.
 * `singleRaid` missions reset to the raid's own contribution rather than
 * accumulating across raids.
 */
export function applyRaidToMissions(
  current: readonly MissionProgressInput[],
  context: RaidMissionContext,
): MissionUpdate[] {
  const updates: MissionUpdate[] = [];
  for (const row of current) {
    const mission = getAnyMission(row.missionId);
    if (!mission) continue;
    if (row.completed) continue;

    const delta = raidProgressFor(mission, context);
    if (delta <= 0) continue;

    const progress = mission.singleRaid
      ? Math.max(row.progress, delta)
      : row.progress + delta;
    const completed = progress >= mission.target;
    updates.push({
      missionId: mission.id,
      progress: Math.min(progress, mission.target),
      target: mission.target,
      completed,
      justCompleted: completed && !row.completed,
      daily: row.daily,
    });
  }
  return updates;
}

/** Missions a player is allowed to see, given their level and completions. */
export function availableMissions(
  all: readonly MissionDefinition[],
  level: number,
  completedIds: readonly string[],
): MissionDefinition[] {
  return all.filter((mission) => {
    if (mission.requiredLevel > level) return false;
    if (mission.requires?.some((id) => !completedIds.includes(id))) return false;
    return true;
  });
}
