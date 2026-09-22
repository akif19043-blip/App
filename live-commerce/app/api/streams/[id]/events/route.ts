import { uuid } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHub } from "@/lib/realtime/hub";
import { adjustViewerCount, getStream } from "@/lib/streams/service";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events feed for one stream: bids, timer changes, chat, viewer
 * count. Clients use EventSource, which reconnects on its own; after each
 * (re)connect they refetch the room snapshot so nothing is missed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = uuid.safeParse((await params).id);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const streamId = parsed.data;

  const db = await getDb();
  const stream = await getStream(db, streamId);
  if (!stream) return new Response("Not found", { status: 404 });
  const hub = await getHub();
  const encoder = new TextEncoder();

  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      write("retry: 1500\n\n");
      write(`event: ready\ndata: {}\n\n`);
      const unsubscribe = hub.subscribe(streamId, (event) => write(`data: ${JSON.stringify(event)}\n\n`));
      // Comment lines keep proxies from closing an idle connection.
      const heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
      void adjustViewerCount(db, streamId, 1).catch(() => {});

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        void adjustViewerCount(db, streamId, -1).catch(() => {});
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
