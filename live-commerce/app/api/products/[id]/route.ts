import { handle, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { deleteDraftProduct } from "@/lib/streams/service";

export const DELETE = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const seller = await requireUser("seller");
  await deleteDraftProduct(await getDb(), seller.id, uuid.parse((await params).id));
  return { ok: true };
});
