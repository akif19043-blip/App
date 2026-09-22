import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { migrate } from "./migrate";
import { seedDemoData } from "./seed";
import type { Database } from "./types";

export type { Database, Queryable } from "./types";

// One connection pool per server process. Kept on globalThis so Next's dev
// hot reload does not open a new pool (or a second PGlite) on every edit.
const g = globalThis as typeof globalThis & { __liveDb?: Promise<Database> };

async function open(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { createPostgresDatabase } = await import("./postgres");
    const db = createPostgresDatabase(url);
    if (process.env.DB_AUTO_MIGRATE === "true") await migrate(db);
    return db;
  }

  // No DATABASE_URL: embedded Postgres on disk, migrated and seeded on boot.
  const { createPgliteDatabase } = await import("./pglite");
  const dir = process.env.PGLITE_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "pglite");
  const dataDir = dir === "memory://" ? dir : path.resolve(/*turbopackIgnore: true*/ dir);
  if (dataDir !== "memory://") await mkdir(path.dirname(dataDir), { recursive: true });
  const db = await createPgliteDatabase(dataDir);
  await migrate(db);
  if (process.env.SEED_DEMO_DATA !== "false") await seedDemoData(db);
  return db;
}

export function getDb(): Promise<Database> {
  g.__liveDb ??= open().catch((err) => {
    g.__liveDb = undefined;
    throw err;
  });
  return g.__liveDb;
}
