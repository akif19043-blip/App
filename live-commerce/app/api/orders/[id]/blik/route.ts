import { NextResponse } from "next/server";
import { handle, readJson, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { payWithBlik } from "@/lib/orders/service";
import { blikSchema } from "@/lib/validation";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const orderId = uuid.parse((await params).id);
  const input = await readJson(req, blikSchema);
  const result = await payWithBlik(await getDb(), { orderId, buyerId: user.id, ...input });
  return NextResponse.json(result, { status: result.ok ? 200 : 402 });
});
