import type { Database } from "./types";
import { hashPassword } from "@/lib/auth/password";

export const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNTS = [
  { email: "sprzedawca@demo.pl", username: "RetroSkarbiec", role: "seller" },
  { email: "kupujacy@demo.pl", username: "ania_z_wawy", role: "buyer" },
  { email: "kupujacy2@demo.pl", username: "tomek.krk", role: "buyer" },
] as const;

/** Demo accounts, a live stream with a queue of items, and an upcoming one. */
export async function seedDemoData(db: Database): Promise<boolean> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from users");
  if (rows[0].n > 0) return false;

  const hash = await hashPassword(DEMO_PASSWORD);
  await db.transaction(async (tx) => {
    const ids: Record<string, string> = {};
    for (const a of DEMO_ACCOUNTS) {
      const r = await tx.query<{ id: string }>(
        "insert into users (email, username, password_hash, role, default_paczkomat_id) values ($1, $2, $3, $4, $5) returning id",
        [a.email, a.username, hash, a.role, a.role === "buyer" ? "WAW123M" : null],
      );
      ids[a.email] = r.rows[0].id;
    }
    const seller = ids["sprzedawca@demo.pl"];

    const live = await tx.query<{ id: string }>(
      `insert into streams (seller_id, title, category, status, livekit_room_id, started_at)
       values ($1, 'Retro konsole i gry — licytacje od 50 zł', 'Gry retro', 'live', 'live-demo-retro', now())
       returning id`,
      [seller],
    );
    const items = [
      ["Pegasus MT-777DX z pudełkiem", "Oryginalne pudełko, 2 pady, pistolet. Sprawdzony, działa.", 5_000, "/demo/pegasus.svg"],
      ["Game Boy Color — Atomic Purple", "Stan bardzo dobry, nowa szybka ekranu.", 15_000, "/demo/gameboy.svg"],
      ["Kaseta „Wiedźmin” (2007) — edycja kolekcjonerska", "Komplet: mapa, podręcznik, ścieżka dźwiękowa.", 8_000, "/demo/witcher.svg"],
      ["PlayStation 2 Slim + 5 gier", "Czipowana, dwa pady, karta pamięci 8 MB.", 25_000, "/demo/ps2.svg"],
    ] as const;
    for (const [i, [title, description, price, image]] of items.entries()) {
      await tx.query(
        `insert into products (stream_id, title, description, starting_price, images, position)
         values ($1, $2, $3, $4, $5, $6)`,
        [live.rows[0].id, title, description, price, [image], i + 1],
      );
    }

    await tx.query(
      `insert into streams (seller_id, title, category, status, livekit_room_id)
       values ($1, 'Sneakersy — wieczorny drop', 'Obuwie', 'upcoming', 'live-demo-sneakers')`,
      [seller],
    );
  });
  return true;
}
