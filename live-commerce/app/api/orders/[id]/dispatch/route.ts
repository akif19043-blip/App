import { handle, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dispatchOrder } from "@/lib/orders/service";

export const POST = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const seller = await requireUser("seller");
  return { order: await dispatchOrder(await getDb(), { orderId: uuid.parse((await params).id), sellerId: seller.id }) };
});
