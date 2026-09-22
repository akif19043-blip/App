import { handle, readJson, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { selectLocker } from "@/lib/orders/service";
import { lockerSchema } from "@/lib/validation";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const orderId = uuid.parse((await params).id);
  const { lockerCode, remember } = await readJson(req, lockerSchema);
  return { order: await selectLocker(await getDb(), { orderId, buyerId: user.id, lockerCode, remember }) };
});
