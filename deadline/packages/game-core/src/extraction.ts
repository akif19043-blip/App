import {
  PlayerRaidState,
  RaidPhase,
  distance2D,
  type ExtractionPoint,
  type Vec3,
} from '@deadline/shared';

export interface ExtractionAttempt {
  pointId: string;
  /** Seconds accumulated inside the zone. */
  elapsed: number;
}

export interface ExtractionEligibility {
  readonly ok: boolean;
  readonly reason?:
    | 'not_alive'
    | 'not_assigned'
    | 'out_of_range'
    | 'match_not_active'
    | 'unknown_point';
  readonly point?: ExtractionPoint;
}

/**
 * Authoritative extraction eligibility check.
 *
 * Called both when the client asks to start extracting and on every tick while
 * the attempt runs, so leaving the zone (or dying) cancels it immediately.
 */
export function checkExtractionEligibility(params: {
  readonly position: Vec3;
  readonly playerState: PlayerRaidState;
  readonly phase: RaidPhase;
  readonly extractionPointId: string;
  readonly assignedPointIds: readonly string[];
  readonly allPoints: readonly ExtractionPoint[];
}): ExtractionEligibility {
  const { position, playerState, phase, extractionPointId, assignedPointIds, allPoints } = params;

  if (phase !== RaidPhase.Active && phase !== RaidPhase.FinalPhase) {
    return { ok: false, reason: 'match_not_active' };
  }
  if (playerState !== PlayerRaidState.Alive && playerState !== PlayerRaidState.Extracting) {
    return { ok: false, reason: 'not_alive' };
  }
  const point = allPoints.find((candidate) => candidate.id === extractionPointId);
  if (!point) return { ok: false, reason: 'unknown_point' };
  if (!assignedPointIds.includes(extractionPointId)) {
    return { ok: false, reason: 'not_assigned' };
  }
  if (distance2D(position, point.position) > point.radius) {
    return { ok: false, reason: 'out_of_range', point };
  }
  return { ok: true, point };
}

/** The assigned extraction the player is currently standing in, if any. */
export function extractionAtPosition(
  position: Vec3,
  assignedPointIds: readonly string[],
  allPoints: readonly ExtractionPoint[],
): ExtractionPoint | null {
  for (const point of allPoints) {
    if (!assignedPointIds.includes(point.id)) continue;
    if (distance2D(position, point.position) <= point.radius) return point;
  }
  return null;
}

export interface ExtractionTickResult {
  readonly progress: number;
  readonly remainingSeconds: number;
  readonly completed: boolean;
}

/** Advance an in-progress extraction by `dt` seconds. */
export function stepExtraction(
  attempt: ExtractionAttempt,
  dt: number,
  extractionTimeSeconds: number,
): ExtractionTickResult {
  attempt.elapsed = Math.min(extractionTimeSeconds, attempt.elapsed + Math.max(0, dt));
  const progress = extractionTimeSeconds <= 0 ? 1 : attempt.elapsed / extractionTimeSeconds;
  return {
    progress: Math.min(1, progress),
    remainingSeconds: Math.max(0, extractionTimeSeconds - attempt.elapsed),
    completed: attempt.elapsed >= extractionTimeSeconds,
  };
}

/**
 * Pick the extraction points a player is allowed to use this raid.
 * Deterministic per (raid seed, player) so it never changes mid-raid.
 */
export function assignExtractions(
  allPoints: readonly ExtractionPoint[],
  count: number,
  pick: (items: readonly ExtractionPoint[]) => ExtractionPoint[],
): string[] {
  const shuffled = pick(allPoints);
  return shuffled.slice(0, Math.max(1, Math.min(count, allPoints.length))).map((p) => p.id);
}
