import { handle, uuid } from "@/lib/api";
import { getProduct, settleAuction } from "@/lib/auction/service";
import { getDb } from "@/lib/db";

/**
 * Clients call this when their countdown reaches zero. Settlement checks the
 * database clock itself, so an early or duplicate call is a harmless no-op.
 */
export const POST = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const productId = uuid.parse((await params).id);
  const db = await getDb();
  const settled = await settleAuction(db, productId);
  return { settled, product: await getProduct(db, productId) };
});
