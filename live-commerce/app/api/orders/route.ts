import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listOrders } from "@/lib/orders/service";

export const GET = handle(async () => {
  const user = await requireUser();
  return listOrders(await getDb(), user.id);
});
