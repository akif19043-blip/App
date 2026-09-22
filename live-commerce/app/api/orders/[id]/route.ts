import { handle, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { getOrder, listOrderEvents } from "@/lib/orders/service";

export const GET = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const db = await getDb();
  const order = await getOrder(db, uuid.parse((await params).id));
  if (!order) throw notFound("Nie ma takiego zamówienia.");
  if (order.buyerId !== user.id && order.sellerId !== user.id && user.role !== "admin") throw forbidden();
  return { order, events: await listOrderEvents(db, order.id) };
});
