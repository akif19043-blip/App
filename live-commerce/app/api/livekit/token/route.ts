import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { handle, uuid } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { livekitConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getStream } from "@/lib/streams/service";

/**
 * Join token for the stream's LiveKit room. Only the stream's seller may
 * publish; everyone else (guests included) subscribes. WebRTC through the
 * LiveKit SFU keeps glass-to-glass latency well under a second, which live
 * bidding needs — HLS would put viewers 5–20 s behind the auctioneer.
 */
export const GET = handle(async (req) => {
  const cfg = livekitConfig();
  if (!cfg) return { enabled: false };

  const streamId = uuid.parse(new URL(req.url).searchParams.get("streamId"));
  const stream = await getStream(await getDb(), streamId);
  if (!stream) throw notFound("Nie ma takiej transmisji.");

  const user = await getCurrentUser();
  const isHost = user?.id === stream.sellerId;
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: user ? user.id : `guest-${randomUUID()}`,
    name: user?.username ?? "Gość",
    ttl: "4h",
  });
  token.addGrant({
    room: stream.livekitRoomId,
    roomJoin: true,
    canSubscribe: true,
    canPublish: isHost && stream.status !== "ended",
    canPublishData: false,
  });
  return { enabled: true, url: cfg.url, token: await token.toJwt(), isHost };
});
