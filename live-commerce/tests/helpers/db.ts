import { randomBytes } from "node:crypto";
import pg from "pg";
import { hashPassword } from "@/lib/auth/password";
import { migrate } from "@/lib/db/migrate";
import { createPgliteDatabase } from "@/lib/db/pglite";
import { createPostgresDatabase } from "@/lib/db/postgres";
import type { Database } from "@/lib/db/types";

/**
 * A fresh, migrated database for one test file.
 *
 * By default this is in-memory PGlite. Set TEST_DATABASE_URL (a Postgres
 * server you can create databases on) to run the same tests against real
 * Postgres, where concurrent transactions genuinely race for row locks.
 */
export async function createTestDb(): Promise<Database & { destroy(): Promise<void> }> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    const db = await createPgliteDatabase("memory://");
    await migrate(db);
    return Object.assign(db, { destroy: () => db.close() });
  }

  const name = `lc_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = createPostgresDatabase(url.toString());
  await migrate(db);
  return Object.assign(db, {
    async destroy() {
      await db.close();
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  });
}

let passwordHash: string | undefined;

export async function makeUser(db: Database, username: string, role: "buyer" | "seller" = "buyer") {
  passwordHash ??= await hashPassword("secret123");
  const { rows } = await db.query<{ id: string }>(
    "insert into users (email, username, password_hash, role) values ($1, $2, $3, $4) returning id",
    [`${username.toLowerCase()}@test.pl`, username, passwordHash, role],
  );
  return rows[0].id;
}

/** Move the running auction's end time to `ms` from now (DB clock). */
export async function setRemaining(db: Database, productId: string, ms: number) {
  await db.query(
    "update products set auction_ends_at = clock_timestamp() + $2::int * interval '1 millisecond' where id = $1",
    [productId, ms],
  );
}

export async function remainingMs(db: Database, productId: string): Promise<number> {
  const { rows } = await db.query<{ ms: number }>(
    "select (extract(epoch from (auction_ends_at - clock_timestamp())) * 1000)::int as ms from products where id = $1",
    [productId],
  );
  return rows[0].ms;
}
