"use client";

import { Crown, Gavel, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/hooks/use-countdown";
import { minimumNextBid, QUICK_BID_INCREMENTS } from "@/lib/auction/rules";
import { api } from "@/lib/client";
import type { LastResult } from "@/lib/live/room-state";
import { formatPLN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Product, User } from "@/types/domain";
import { Countdown } from "./countdown";

interface BidResponse {
  ok: boolean;
  message?: string;
}

/** Amounts for the two quick-bid buttons: +10 zł and +20 zł over the current price. */
export function quickBidAmounts(p: Pick<Product, "startingPrice" | "currentHighestBid">): [number, number] {
  const min = minimumNextBid(p);
  return [min, min + (QUICK_BID_INCREMENTS[1] - QUICK_BID_INCREMENTS[0])];
}

export function AuctionPanel({
  product,
  user,
  isHost,
  streamId,
  bidPulse,
  extendedAt,
  lastResult,
  onPay,
  onNotice,
}: {
  product: Product | null;
  user: User | null;
  isHost: boolean;
  streamId: string;
  bidPulse: number;
  extendedAt: number | null;
  lastResult: LastResult | null;
  onPay: (orderId: string) => void;
  onNotice: (text: string) => void;
}) {
  const msLeft = useCountdown(product?.auctionEndsAt ?? null);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const settleRequested = useRef<string | null>(null);

  // Timer hit zero: the server sweeper settles within ~250 ms. If it has not
  // (e.g. a serverless deploy), nudge it — settlement is idempotent.
  useEffect(() => {
    if (!product || msLeft !== 0 || settleRequested.current === product.auctionEndsAt) return;
    settleRequested.current = product.auctionEndsAt;
    const t = setTimeout(() => {
      void fetch(`/api/products/${product.id}/settle`, { method: "POST" }).catch(() => {});
    }, 1200 + Math.random() * 800);
    return () => clearTimeout(t);
  }, [msLeft, product]);

  const showExtended = extendedAt != null && Date.now() - extendedAt < 1500;

  if (!product) {
    return <IdleCard lastResult={lastResult} user={user} isHost={isHost} onPay={onPay} />;
  }

  const [small, big] = quickBidAmounts(product);
  const leading = user && product.currentHighestBidderId === user.id;
  const ended = msLeft === 0;

  async function bid(amount: number) {
    if (!product) return;
    setPendingAmount(amount);
    try {
      const res = await api<BidResponse>(`/api/products/${product.id}/bids`, { body: { amount }, okStatuses: [409] });
      if (!res.ok && res.message) onNotice(res.message);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Nie udało się złożyć oferty.");
    } finally {
      setPendingAmount(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/55 p-3 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-3">
        {product.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt="" className="size-14 shrink-0 rounded-lg bg-white/10 object-cover" />
        ) : (
          <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-white/10">
            <Gavel className="size-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{product.title}</p>
          <p key={bidPulse} className="animate-bid-pop origin-left text-2xl font-black tabular-nums">
            {formatPLN(product.currentHighestBid ?? product.startingPrice)}
          </p>
          <p className="truncate text-xs text-white/70">
            {product.currentHighestBidderName ? (
              <>
                <Crown className="mr-1 inline size-3 text-amber-300" />
                {leading ? "Prowadzisz!" : product.currentHighestBidderName} · {product.bidCount}{" "}
                {product.bidCount === 1 ? "oferta" : "ofert"}
              </>
            ) : (
              "Cena wywoławcza — bądź pierwszy!"
            )}
          </p>
        </div>
        <Countdown msLeft={msLeft} extended={showExtended} />
      </div>

      {!isHost && (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          {!user ? (
            <Button asChild size="xl" className="col-span-2">
              <Link href={`/login?next=/live/${streamId}`}>Zaloguj się, aby licytować</Link>
            </Button>
          ) : (
            <>
              <Button
                size="xl"
                className={cn("font-black", leading && "bg-emerald-600 hover:bg-emerald-600")}
                disabled={!!leading || ended || pendingAmount != null}
                onClick={() => bid(small)}
              >
                {pendingAmount === small ? <Loader2 className="animate-spin" /> : <Gavel />}
                {leading ? "Twoja oferta prowadzi" : `Licytuj ${formatPLN(small)}`}
              </Button>
              <Button
                size="xl"
                variant="secondary"
                className="bg-white/90 px-4 font-black text-black hover:bg-white"
                disabled={!!leading || ended || pendingAmount != null}
                onClick={() => bid(big)}
                aria-label={`Licytuj ${formatPLN(big)}`}
              >
                {pendingAmount === big ? (
                  <Loader2 className="animate-spin" />
                ) : product.currentHighestBid != null ? (
                  "+20 zł"
                ) : (
                  formatPLN(big)
                )}
              </Button>
            </>
          )}
        </div>
      )}
      {isHost && (
        <p className="mt-2 text-center text-xs text-white/60">
          {ended ? "Rozliczanie…" : "Licytacja trwa — oferta w ostatnich 5 s przedłuża czas do 10 s."}
        </p>
      )}
    </div>
  );
}

function IdleCard({
  lastResult,
  user,
  isHost,
  onPay,
}: {
  lastResult: LastResult | null;
  user: User | null;
  isHost: boolean;
  onPay: (orderId: string) => void;
}) {
  if (lastResult?.status === "sold") {
    const won = user && lastResult.winnerId === user.id;
    return (
      <div
        className={cn(
          "animate-slide-up rounded-2xl border p-4 text-white shadow-2xl backdrop-blur-md",
          won ? "border-amber-300/50 bg-amber-500/80" : "border-white/10 bg-black/55",
        )}
      >
        <div className="flex items-center gap-3">
          <Trophy className="size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-black">{won ? "Wygrałeś licytację!" : "Sprzedane!"}</p>
            <p className="truncate text-sm">
              {won ? "Twoja oferta" : lastResult.winnerName} · {formatPLN(lastResult.finalPrice ?? 0)}
            </p>
          </div>
          {won && lastResult.orderId && (
            <Button variant="blik" onClick={() => onPay(lastResult.orderId!)}>
              Zapłać BLIK
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-black/45 p-4 text-center text-sm text-white/80 backdrop-blur-md">
      {lastResult?.status === "unsold"
        ? "Brak ofert — przedmiot wraca do kolejki."
        : isHost
          ? "Wybierz przedmiot z kolejki i wciśnij Start."
          : "Za chwilę kolejny przedmiot…"}
    </div>
  );
}
