import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "./types";

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

// Arbitrary constant: serialises concurrent migrators (several app instances
// booting at once) on a real Postgres server.
const MIGRATION_LOCK_KEY = 72_410_001;

/** Apply every not-yet-applied `db/migrations/*.sql` file, in name order. */
export async function migrate(db: Database, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];

  await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
    await tx.exec(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const { rows } = await tx.query<{ name: string }>("select name from schema_migrations");
    const done = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (done.has(file)) continue;
      await tx.exec(await readFile(path.join(dir, file), "utf8"));
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
      applied.push(file);
    }
  });

  return applied;
}
