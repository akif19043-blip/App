import { distance2D, type PlayerSpawnPoint, type Vec3, type Rng } from '@deadline/shared';

/**
 * Safe-spawn selection.
 *
 * Picks the candidate that maximises the distance to everyone already placed,
 * with a random tie-break so consecutive raids do not always use the same
 * corner. This is what keeps players from deploying on top of each other and
 * blunts spawn camping.
 */
export function pickSafeSpawn(
  candidates: readonly PlayerSpawnPoint[],
  occupied: readonly Vec3[],
  rng: Rng,
  minimumDistance = 90,
): PlayerSpawnPoint {
  if (candidates.length === 0) {
    throw new Error('pickSafeSpawn called without candidates');
  }

  const shuffled = rng.shuffle(candidates);
  let best: PlayerSpawnPoint | null = null;
  let bestScore = -Infinity;

  for (const candidate of shuffled) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of occupied) {
      nearest = Math.min(nearest, distance2D(candidate.position, other));
    }
    if (occupied.length === 0) return candidate;
    if (nearest >= minimumDistance) return candidate;
    if (nearest > bestScore) {
      bestScore = nearest;
      best = candidate;
    }
  }

  return best ?? (shuffled[0] as PlayerSpawnPoint);
}
