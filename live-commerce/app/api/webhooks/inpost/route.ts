import { timingSafeEqual } from "node:crypto";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { applyInpostStatus } from "@/lib/orders/service";
import { inpostWebhookSchema } from "@/lib/validation";

/** InPost ShipX status webhook: parcel waiting in the locker / collected. */
export const POST = handle(async (req) => {
  const secret = process.env.INPOST_WEBHOOK_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    throw new AppError("unauthorized", "Invalid webhook signature.", 401);
  }
  const { tracking_number, status } = await readJson(req, inpostWebhookSchema);
  const order = await applyInpostStatus(await getDb(), { trackingNumber: tracking_number, status });
  return { ok: true, orderId: order.id, shipmentStatus: order.shipmentStatus };
});
