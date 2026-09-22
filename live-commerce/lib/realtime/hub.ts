import "server-only";
import { settleExpiredAuctions } from "@/lib/auction/service";
import { getDb } from "@/lib/db";
import type { Database } from "@/lib/db/types";
import type { LiveEvent } from "@/types/domain";
import { LIVE_CHANNEL } from "./notify";

type Listener = (event: LiveEvent) => void;

/**
 * Per-process fan-out. Every instance LISTENs on the Postgres channel and
 * forwards each event to the SSE connections it holds for that stream, so a
 * bid committed on instance A reaches viewers connected to instance B.
 *
 * It also runs the settlement sweeper: auctions close on time even if no
 * client is around to notice the timer hit zero.
 */
class LiveHub {
  private readonly subscribers = new Map<string, Set<Listener>>();

  constructor(private readonly db: Database) {}

  async start() {
    await this.db.listen(LIVE_CHANNEL, (payload) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(payload);
      } catch {
        return;
      }
      for (const fn of this.subscribers.get(event.streamId) ?? []) {
        try {
          fn(event);
        } catch (err) {
          console.error("[hub] subscriber failed", err);
        }
      }
    });

    let sweeping = false;
    const sweep = setInterval(async () => {
      if (sweeping) return;
      sweeping = true;
      try {
        await settleExpiredAuctions(this.db);
      } catch (err) {
        console.error("[hub] settlement sweep failed", err);
      } finally {
        sweeping = false;
      }
    }, Number(process.env.SETTLE_SWEEP_MS ?? 250));
    sweep.unref?.();
  }

  subscribe(streamId: string, fn: Listener): () => void {
    let set = this.subscribers.get(streamId);
    if (!set) this.subscribers.set(streamId, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (!set.size) this.subscribers.delete(streamId);
    };
  }
}

const g = globalThis as typeof globalThis & { __liveHub?: Promise<LiveHub> };

export function getHub(): Promise<LiveHub> {
  g.__liveHub ??= (async () => {
    const hub = new LiveHub(await getDb());
    await hub.start();
    return hub;
  })().catch((err) => {
    g.__liveHub = undefined;
    throw err;
  });
  return g.__liveHub;
}
