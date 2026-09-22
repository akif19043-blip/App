// Database CLI for real Postgres deployments (e.g. Supabase).
//
//   DATABASE_URL=postgres://… npm run db:migrate
//   DATABASE_URL=postgres://… npm run db:seed      (demo data, empty DB only)
//
// Without DATABASE_URL the app uses embedded PGlite and does both on boot.

import { migrate } from "@/lib/db/migrate";
import { createPostgresDatabase } from "@/lib/db/postgres";
import { seedDemoData } from "@/lib/db/seed";

const command = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = createPostgresDatabase(url);
try {
  if (command === "migrate") {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
  } else if (command === "seed") {
    await migrate(db);
    console.log((await seedDemoData(db)) ? "Demo data inserted." : "Database already has users; skipped.");
  } else {
    console.error("Usage: tsx scripts/db.mts <migrate|seed>");
    process.exitCode = 1;
  }
} finally {
  await db.close();
}
