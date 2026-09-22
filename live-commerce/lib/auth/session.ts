import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/errors";
import type { User, UserRole } from "@/types/domain";
import { createSession, deleteSession, userForSession } from "./users";

export const SESSION_COOKIE = "lc_session";

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForSession(await getDb(), token);
});

export async function requireUser(...roles: UserRole[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (roles.length && !roles.includes(user.role) && user.role !== "admin") {
    throw forbidden("Ta funkcja jest dostępna tylko dla sprzedawców.");
  }
  return user;
}

export async function signIn(userId: string) {
  const { token, expiresAt } = await createSession(await getDb(), userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  jar.delete(SESSION_COOKIE);
}
