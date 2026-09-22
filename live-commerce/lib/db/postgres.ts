import pg from "pg";
import type { Database, Queryable } from "./types";

// Timestamps come back as Date by default; bigint (int8) as string. The schema
// avoids int8 for anything the app reads, so the defaults are fine.

/**
 * Production driver: a pooled connection to Postgres (e.g. Supabase).
 *
 * LISTEN needs a session-level connection, so on Supabase point
 * DATABASE_URL at the direct connection or the session pooler (port 5432),
 * not the transaction pooler (6543).
 */
export function createPostgresDatabase(connectionString: string): Database {
  const ssl =
    /sslmode=require|supabase\.(co|com)/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({
    connectionString,
    ssl,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  });
  pool.on("error", (err) => console.error("[db] idle client error", err));

  const listeners = new Map<string, Set<(payload: string) => void>>();
  let listenClient: pg.Client | null = null;
  let connecting: Promise<pg.Client> | null = null;

  async function getListenClient(): Promise<pg.Client> {
    if (listenClient) return listenClient;
    connecting ??= (async () => {
      const client = new pg.Client({ connectionString, ssl });
      await client.connect();
      client.on("notification", (msg) => {
        if (msg.payload == null) return;
        for (const cb of listeners.get(msg.channel) ?? []) cb(msg.payload);
      });
      client.on("error", (err) => {
        console.error("[db] listen connection lost, reconnecting", err);
        listenClient = null;
        connecting = null;
        setTimeout(() => void resubscribeAll(), 1000);
      });
      listenClient = client;
      return client;
    })();
    try {
      return await connecting;
    } catch (err) {
      connecting = null;
      throw err;
    }
  }

  async function resubscribeAll() {
    try {
      const client = await getListenClient();
      for (const channel of listeners.keys()) await client.query(`LISTEN ${pg.escapeIdentifier(channel)}`);
    } catch (err) {
      console.error("[db] resubscribe failed, retrying", err);
      setTimeout(() => void resubscribeAll(), 2000);
    }
  }

  const q: Queryable = {
    async query<T>(sql: string, params?: unknown[]) {
      const res = await pool.query(sql, params);
      return { rows: res.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
  };

  return {
    kind: "postgres",
    ...q,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query<T>(sql: string, params?: unknown[]) {
            const res = await client.query(sql, params);
            return { rows: res.rows as T[] };
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async listen(channel, onPayload) {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
        const client = await getListenClient();
        await client.query(`LISTEN ${pg.escapeIdentifier(channel)}`);
      }
      set.add(onPayload);
      return async () => {
        set.delete(onPayload);
      };
    },
    async close() {
      await listenClient?.end().catch(() => {});
      await pool.end();
    },
  };
}
