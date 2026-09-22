import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveRoom } from "@/components/live/live-room";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getRoomSnapshot, getStream } from "@/lib/streams/service";

export const dynamic = "force-dynamic";

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const stream = isUuid(id) ? await getStream(await getDb(), id) : null;
  return { title: stream ? `${stream.title} — @${stream.sellerName}` : "Transmisja" };
}

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [snapshot, user] = await Promise.all([getRoomSnapshot(await getDb(), id), getCurrentUser()]);
  if (!snapshot) notFound();
  return <LiveRoom initial={snapshot} user={user} />;
}
