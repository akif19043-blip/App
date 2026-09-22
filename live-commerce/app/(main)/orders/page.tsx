import type { Metadata } from "next";
import { OrdersView } from "@/components/orders/orders-view";
import { requirePageUser } from "@/lib/auth/page-guard";
import { demoToolsEnabled } from "@/lib/config";
import { getDb } from "@/lib/db";
import { listOrders } from "@/lib/orders/service";

export const metadata: Metadata = { title: "Zamówienia" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requirePageUser("/orders");
  const lists = await listOrders(await getDb(), user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Zamówienia</h1>
      <OrdersView initial={lists} user={user} demoTools={demoToolsEnabled()} />
    </div>
  );
}
