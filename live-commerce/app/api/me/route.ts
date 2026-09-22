import { handle, readJson } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { updateProfile } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { profileSchema } from "@/lib/validation";

export const GET = handle(async () => ({ user: await getCurrentUser() }));

export const PATCH = handle(async (req) => {
  const me = await requireUser();
  const input = await readJson(req, profileSchema);
  return { user: await updateProfile(await getDb(), me.id, input) };
});
