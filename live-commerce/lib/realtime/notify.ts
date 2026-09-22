import type { Queryable } from "@/lib/db/types";
import type { LiveEvent } from "@/types/domain";

/** Postgres NOTIFY channel every app instance LISTENs on. */
export const LIVE_CHANNEL = "live_events";

/**
 * Queue a live event. Called inside the transaction that caused it, so
 * Postgres only delivers it if (and when) that transaction commits.
 */
export async function publish(q: Queryable, event: LiveEvent): Promise<void> {
  await q.query("select pg_notify($1, $2)", [LIVE_CHANNEL, JSON.stringify(event)]);
}
