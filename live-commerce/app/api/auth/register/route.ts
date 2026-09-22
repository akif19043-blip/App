import { handle, readJson } from "@/lib/api";
import { signIn } from "@/lib/auth/session";
import { registerUser } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { registerSchema } from "@/lib/validation";

export const POST = handle(async (req) => {
  const input = await readJson(req, registerSchema);
  const user = await registerUser(await getDb(), input);
  await signIn(user.id);
  return { user };
});
