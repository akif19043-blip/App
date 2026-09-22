import { handle } from "@/lib/api";
import { searchPaczkomaty } from "@/lib/shipping/lockers";

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const near = Number.isFinite(lat) && Number.isFinite(lng) && url.searchParams.has("lat") ? { lat, lng } : undefined;
  return { lockers: searchPaczkomaty({ query: url.searchParams.get("q") ?? "", near, limit: 20 }) };
});
