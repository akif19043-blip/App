import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";

/** The authoritative clock (the database's), for client-side offset estimation. */
export const GET = handle(async () => {
  const { rows } = await (await getDb()).query<{ now: Date }>("select clock_timestamp() as now");
  return Response.json({ now: new Date(rows[0].now).getTime() }, { headers: { "cache-control": "no-store" } });
});
