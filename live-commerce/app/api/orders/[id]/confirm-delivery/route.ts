import { handle, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { confirmDelivery } from "@/lib/orders/service";

export const POST = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  return { order: await confirmDelivery(await getDb(), { orderId: uuid.parse((await params).id), buyerId: user.id }) };
});
