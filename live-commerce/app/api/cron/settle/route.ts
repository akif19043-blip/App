import { settleExpiredAuctions } from "@/lib/auction/service";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * For serverless deployments without a long-lived process to run the
 * sweeper: call every few seconds (e.g. Supabase pg_cron + pg_net, or an
 * external scheduler) with `Authorization: Bearer $CRON_SECRET`.
 */
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new AppError("unauthorized", "Unauthorized", 401);
  }
  return { settled: await settleExpiredAuctions(await getDb()) };
});
