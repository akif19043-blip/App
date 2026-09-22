import { handle, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { demoToolsEnabled } from "@/lib/config";
import { getDb } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { applyInpostStatus, getOrder } from "@/lib/orders/service";

/** Demo only: pretend InPost delivered the parcel to the buyer's locker. */
export const POST = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  if (!demoToolsEnabled()) throw notFound();
  const user = await requireUser();
  const db = await getDb();
  const order = await getOrder(db, uuid.parse((await params).id));
  if (!order?.inpostTrackingNumber) throw notFound("Zamówienie nie ma jeszcze przesyłki.");
  if (order.buyerId !== user.id && order.sellerId !== user.id) throw forbidden();
  return { order: await applyInpostStatus(db, { trackingNumber: order.inpostTrackingNumber, status: "ready_to_pickup" }) };
});
