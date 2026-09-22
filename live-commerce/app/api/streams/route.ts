import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createStream, listStreams } from "@/lib/streams/service";
import { createStreamSchema } from "@/lib/validation";

export const GET = handle(async () => ({ streams: await listStreams(await getDb(), { status: ["live", "upcoming"] }) }));

export const POST = handle(async (req) => {
  const seller = await requireUser("seller");
  const input = await readJson(req, createStreamSchema);
  return { stream: await createStream(await getDb(), seller.id, input) };
});
