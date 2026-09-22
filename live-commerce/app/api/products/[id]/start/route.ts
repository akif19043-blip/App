import { handle, uuid } from "@/lib/api";
import { startAuction } from "@/lib/auction/service";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const POST = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const seller = await requireUser("seller");
  const productId = uuid.parse((await params).id);
  return { product: await startAuction(await getDb(), { productId, sellerId: seller.id }) };
});
