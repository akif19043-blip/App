import { NextResponse } from "next/server";
import { handle, readJson, uuid } from "@/lib/api";
import { placeBid } from "@/lib/auction/service";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { bidSchema } from "@/lib/validation";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const productId = uuid.parse((await params).id);
  const { amount } = await readJson(req, bidSchema);
  const result = await placeBid(await getDb(), { productId, bidderId: user.id, amount });
  // A lost race is a normal outcome, not a server error: 409 with the fresh state.
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
});
