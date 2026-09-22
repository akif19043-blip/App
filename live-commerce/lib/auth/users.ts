import { createHash, randomBytes } from "node:crypto";
import type { Database, Queryable } from "@/lib/db/types";
import { toUser } from "@/lib/db/mappers";
import { AppError } from "@/lib/errors";
import type { User, UserRole } from "@/types/domain";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_DAYS = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function registerUser(
  db: Queryable,
  input: { email: string; username: string; password: string; role: Extract<UserRole, "buyer" | "seller"> },
): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const clash = await db.query<{ email: string }>("select email from users where email = $1 or lower(username) = lower($2)", [
    email,
    username,
  ]);
  if (clash.rows.length) {
    throw new AppError(
      "user_exists",
      clash.rows.some((r) => r.email === email) ? "Ten e-mail jest już zarejestrowany." : "Ta nazwa użytkownika jest zajęta.",
      409,
    );
  }
  const { rows } = await db.query(
    `insert into users (email, username, password_hash, role) values ($1, $2, $3, $4) returning *`,
    [email, username, await hashPassword(input.password), input.role],
  );
  return toUser(rows[0]);
}

export async function authenticate(db: Queryable, email: string, password: string): Promise<User | null> {
  const { rows } = await db.query<{ password_hash: string } & Record<string, unknown>>(
    "select * from users where email = $1",
    [email.trim().toLowerCase()],
  );
  const row = rows[0];
  if (!row) {
    // Burn the same time as a real check so response time does not reveal
    // which e-mails exist.
    await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    return null;
  }
  return (await verifyPassword(password, row.password_hash)) ? toUser(row) : null;
}

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(db: Queryable, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.query("insert into sessions (id, user_id, expires_at) values ($1, $2, $3)", [sha256(token), userId, expiresAt]);
  return { token, expiresAt };
}

export async function userForSession(db: Queryable, token: string): Promise<User | null> {
  const { rows } = await db.query(
    `select u.* from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query("delete from sessions where id = $1", [sha256(token)]);
}

export async function updateProfile(
  db: Database,
  userId: string,
  input: { defaultPaczkomatId?: string | null; forgetBlik?: boolean },
): Promise<User> {
  if (input.defaultPaczkomatId !== undefined) {
    await db.query("update users set default_paczkomat_id = $2 where id = $1", [userId, input.defaultPaczkomatId]);
  }
  if (input.forgetBlik) await db.query("update users set blik_alias = null where id = $1", [userId]);
  const { rows } = await db.query("select * from users where id = $1", [userId]);
  return toUser(rows[0]);
}
