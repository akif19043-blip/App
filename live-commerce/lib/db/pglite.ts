import { PGlite } from "@electric-sql/pglite";
import type { Database, Queryable } from "./types";

/**
 * Embedded Postgres (WASM) for local development and tests. Same SQL dialect
 * and migrations as production, no server to run. `dataDir` of
 * "memory://" keeps everything in RAM.
 */
export async function createPgliteDatabase(dataDir = "memory://"): Promise<Database> {
  const pg = await PGlite.create(dataDir);

  const wrap = (q: Pick<PGlite, "query" | "exec">): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) {
      const res = await q.query<T>(sql, params as unknown[] | undefined);
      return { rows: res.rows };
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
  });

  return {
    kind: "pglite",
    ...wrap(pg),
    transaction(fn) {
      return pg.transaction((tx) => fn(wrap(tx)));
    },
    async listen(channel, onPayload) {
      const unlisten = await pg.listen(channel, onPayload);
      return async () => unlisten();
    },
    close: () => pg.close(),
  };
}
