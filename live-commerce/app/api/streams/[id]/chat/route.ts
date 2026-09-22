import { handle, readJson, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { postChatMessage } from "@/lib/streams/service";
import { chatSchema } from "@/lib/validation";

// Simple per-process flood control: one message per user per 750 ms.
const lastMessageAt = new Map<string, number>();

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const streamId = uuid.parse((await params).id);
  const { body } = await readJson(req, chatSchema);

  const now = Date.now();
  if (now - (lastMessageAt.get(user.id) ?? 0) < 750) {
    throw new AppError("rate_limited", "Zwolnij trochę 🙂", 429);
  }
  lastMessageAt.set(user.id, now);
  if (lastMessageAt.size > 10_000) lastMessageAt.clear();

  return { message: await postChatMessage(await getDb(), { streamId, userId: user.id, body }) };
});
