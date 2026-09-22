import { handle, readJson, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getRoomSnapshot, setStreamStatus } from "@/lib/streams/service";
import { streamStatusSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, { params }: Ctx) => {
  const id = uuid.parse((await params).id);
  const snapshot = await getRoomSnapshot(await getDb(), id);
  if (!snapshot) throw notFound("Nie ma takiej transmisji.");
  return Response.json(snapshot, { headers: { "cache-control": "no-store" } });
});

export const PATCH = handle(async (req, { params }: Ctx) => {
  const seller = await requireUser("seller");
  const streamId = uuid.parse((await params).id);
  const { status } = await readJson(req, streamStatusSchema);
  return { stream: await setStreamStatus(await getDb(), { streamId, sellerId: seller.id, status }) };
});
