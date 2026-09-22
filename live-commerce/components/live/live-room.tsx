"use client";

import { ArrowLeft, Eye, ListOrdered, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckoutModal } from "@/components/checkout/checkout-modal";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLiveRoom } from "@/hooks/use-live-room";
import { useServerClock } from "@/hooks/use-server-clock";
import { activeProduct } from "@/lib/live/room-state";
import { formatPLN } from "@/lib/money";
import type { LiveEvent, RoomSnapshot, User } from "@/types/domain";
import { AuctionPanel } from "./auction-panel";
import { ChatFeed, ChatInput } from "./chat";
import { HostQueue } from "./host-queue";
import { VideoStage } from "./video-stage";

export function LiveRoom({ initial, user }: { initial: RoomSnapshot; user: User | null }) {
  useServerClock();
  const isHost = !!user && user.id === initial.stream.sellerId;
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);

  const showNotice = useCallback((text: string) => setNotice(text), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const onEvent = useCallback(
    (e: LiveEvent) => {
      if (e.type === "bid.placed" && e.extended) showNotice("Oferta w ostatnich sekundach — czas przedłużony do 10 s!");
      // Winner: open checkout straight away while the excitement lasts.
      if (e.type === "auction.settled" && e.status === "sold" && user && e.winnerId === user.id && e.orderId) {
        setCheckoutOrder(e.orderId);
      }
    },
    [user, showNotice],
  );

  const { state, connection } = useLiveRoom(initial, onEvent);
  const product = activeProduct(state);
  const { stream } = state;
  const poster = product?.images[0] ?? state.products.find((p) => p.status === "draft")?.images[0] ?? null;

  return (
    <div className="flex h-dvh w-full bg-black text-white">
      <div className="relative mx-auto h-full w-full max-w-md overflow-hidden md:border-x md:border-white/10">
        <VideoStage streamId={stream.id} isHost={isHost} status={stream.status} poster={poster} />

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href={isHost ? `/seller/streams/${stream.id}` : "/"} aria-label="Wróć" className="grid size-9 place-items-center rounded-full bg-black/40 backdrop-blur">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">@{stream.sellerName}</p>
            <p className="truncate text-xs text-white/75">{stream.title}</p>
          </div>
          {stream.status === "live" && <Badge variant="live">Live</Badge>}
          <Badge variant="glass">
            <Eye /> {stream.viewerCount}
          </Badge>
          {connection === "reconnecting" && (
            <Badge variant="glass" className="text-amber-300" title="Łączenie ponownie…">
              <WifiOff />
            </Badge>
          )}
        </div>

        {/* Bottom stack: chat, auction card, input row */}
        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ChatFeed messages={state.chat} sellerId={stream.sellerId} />
          {(stream.status === "live" || product) && (
            <AuctionPanel
              product={product}
              user={user}
              isHost={isHost}
              streamId={stream.id}
              bidPulse={state.bidPulse}
              extendedAt={state.extendedAt}
              lastResult={state.lastResult}
              onPay={setCheckoutOrder}
              onNotice={showNotice}
            />
          )}
          <div className="flex items-center gap-2">
            <ChatInput streamId={stream.id} signedIn={!!user} disabled={stream.status === "ended"} />
            {isHost && (
              <button
                onClick={() => setQueueOpen(true)}
                className="flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-black md:hidden"
              >
                <ListOrdered className="size-4" /> Kolejka
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div
            role="status"
            className="absolute left-1/2 top-20 z-30 w-[90%] -translate-x-1/2 animate-slide-up rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-black shadow-xl"
          >
            {notice}
          </div>
        )}
      </div>

      {/* Host run sheet: side panel on desktop, bottom sheet on phones. */}
      {isHost && (
        <>
          <aside className="hidden w-80 shrink-0 border-l border-white/10 bg-neutral-950 md:block">
            <HostQueue
              products={state.products}
              streamId={stream.id}
              streamStatus={stream.status}
              auctionRunning={!!product}
              onNotice={showNotice}
            />
          </aside>
          <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
            <DialogContent className="h-[70dvh] border-white/10 bg-neutral-950 p-0 text-white">
              <DialogTitle className="sr-only">Kolejka przedmiotów</DialogTitle>
              <HostQueue
                products={state.products}
                streamId={stream.id}
                streamStatus={stream.status}
                auctionRunning={!!product}
                onNotice={(t) => {
                  setQueueOpen(false);
                  showNotice(t);
                }}
              />
            </DialogContent>
          </Dialog>
        </>
      )}

      {user && !isHost && (
        <CheckoutModal
          orderId={checkoutOrder}
          user={user}
          open={checkoutOrder != null}
          onOpenChange={(o) => !o && setCheckoutOrder(null)}
          onPaid={(order) => showNotice(`Zapłacono ${formatPLN(order.finalPrice)} — dziękujemy!`)}
        />
      )}
    </div>
  );
}
