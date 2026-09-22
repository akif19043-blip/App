import { handle, readJson } from "@/lib/api";
import { signIn } from "@/lib/auth/session";
import { authenticate } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { loginSchema } from "@/lib/validation";

export const POST = handle(async (req) => {
  const { email, password } = await readJson(req, loginSchema);
  const user = await authenticate(await getDb(), email, password);
  if (!user) throw new AppError("invalid_credentials", "Nieprawidłowy e-mail lub hasło.", 401);
  await signIn(user.id);
  return { user };
});
