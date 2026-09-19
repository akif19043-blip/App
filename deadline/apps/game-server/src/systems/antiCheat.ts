import type { SuspiciousEventRecord } from '@deadline/persistence';
import { log } from '../logger.js';

export type SuspiciousKind =
  | 'speed_hack'
  | 'position_teleport'
  | 'fire_rate'
  | 'ammo'
  | 'interaction_range'
  | 'loot_ownership'
  | 'extraction_position'
  | 'invalid_state'
  | 'schema';

export interface AntiCheatSink {
  logSuspicious(event: SuspiciousEventRecord): Promise<void>;
}

/**
 * Suspicious-event recorder.
 *
 * This is not a full anti-cheat: the real defence is that the server never
 * trusts the client in the first place (see CombatSystem / LootSystem, where
 * every action is re-derived server side). This records the rejections so they
 * can be reviewed, and rate-limits the log so a spamming client cannot flood it.
 */
export class AntiCheat {
  private readonly counts = new Map<string, { count: number; windowStart: number }>();
  private readonly sink: AntiCheatSink | null;
  private readonly roomId: string;

  constructor(roomId: string, sink: AntiCheatSink | null) {
    this.roomId = roomId;
    this.sink = sink;
  }

  /** Returns the number of strikes this player has accrued for this kind. */
  report(playerId: string, kind: SuspiciousKind, detail: string): number {
    const key = `${playerId}:${kind}`;
    const now = Date.now();
    const entry = this.counts.get(key);
    if (!entry || now - entry.windowStart > 60_000) {
      this.counts.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
    const count = this.counts.get(key)!.count;

    // Log the first strike of each window, then every tenth, to bound volume.
    if (count === 1 || count % 10 === 0) {
      log.warn('suspicious_event', { playerId, roomId: this.roomId, kind, detail, count });
      void this.sink
        ?.logSuspicious({ playerId, roomId: this.roomId, kind, detail })
        .catch((error: unknown) => {
          log.error('suspicious_event.persist_failed', { error: String(error) });
        });
    }
    return count;
  }

  strikes(playerId: string, kind: SuspiciousKind): number {
    return this.counts.get(`${playerId}:${kind}`)?.count ?? 0;
  }
}
