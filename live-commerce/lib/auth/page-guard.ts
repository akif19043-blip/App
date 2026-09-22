import "server-only";
import { redirect } from "next/navigation";
import type { User, UserRole } from "@/types/domain";
import { getCurrentUser } from "./session";

/** For server pages: send guests to /login and the wrong role home. */
export async function requirePageUser(next: string, ...roles: UserRole[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (roles.length && !roles.includes(user.role) && user.role !== "admin") redirect("/");
  return user;
}
