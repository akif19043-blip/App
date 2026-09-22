import { handle } from "@/lib/api";
import { signOut } from "@/lib/auth/session";

export const POST = handle(async () => {
  await signOut();
  return { ok: true };
});
