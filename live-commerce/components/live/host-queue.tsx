"use client";

import { Gavel, ListOrdered, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProductStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client";
import { formatPLN } from "@/lib/money";
import type { Product, StreamStatus } from "@/types/domain";

/** The host's run sheet: pick the next item and start its 30-second auction. */
export function HostQueue({
  products,
  streamId,
  streamStatus,
  auctionRunning,
  onNotice,
}: {
  products: Product[];
  streamId: string;
  streamStatus: StreamStatus;
  auctionRunning: boolean;
  onNotice: (text: string) => void;
}) {
  const [starting, setStarting] = useState<string | null>(null);
  const [goingLive, setGoingLive] = useState(false);

  const startable = (p: Product) => p.status === "draft" || p.status === "unsold";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <ListOrdered className="size-4" />
        <h2 className="font-bold">Kolejka</h2>
        <Link href={`/seller/streams/${streamId}`} className="ml-auto flex items-center gap-1 text-xs text-white/70 hover:text-white">
          <Plus className="size-3" /> Dodaj
        </Link>
      </div>

      {streamStatus === "upcoming" && (
        <div className="border-b border-white/10 p-4">
          <Button
            className="w-full"
            disabled={goingLive}
            onClick={async () => {
              setGoingLive(true);
              try {
                await api(`/api/streams/${streamId}`, { method: "PATCH", body: { status: "live" } });
              } catch (err) {
                onNotice(err instanceof ApiError ? err.message : "Błąd.");
              } finally {
                setGoingLive(false);
              }
            }}
          >
            {goingLive && <Loader2 className="animate-spin" />} Rozpocznij transmisję
          </Button>
        </div>
      )}

      <ul className="flex-1 divide-y divide-white/10 overflow-y-auto">
        {products.length === 0 && <li className="p-4 text-sm text-white/60">Brak przedmiotów w kolejce.</li>}
        {products.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            {p.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0]} alt="" className="size-10 rounded-md bg-white/10 object-cover" />
            ) : (
              <div className="size-10 rounded-md bg-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.title}</p>
              <p className="text-xs text-white/60">
                {p.currentHighestBid != null ? formatPLN(p.currentHighestBid) : `od ${formatPLN(p.startingPrice)}`}
              </p>
            </div>
            {startable(p) && streamStatus === "live" ? (
              <Button
                size="sm"
                disabled={auctionRunning || starting != null}
                onClick={async () => {
                  setStarting(p.id);
                  try {
                    await api(`/api/products/${p.id}/start`, { body: {} });
                  } catch (err) {
                    onNotice(err instanceof ApiError ? err.message : "Nie udało się wystartować.");
                  } finally {
                    setStarting(null);
                  }
                }}
              >
                {starting === p.id ? <Loader2 className="animate-spin" /> : <Gavel />} Start 30 s
              </Button>
            ) : (
              <ProductStatusBadge status={p.status} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
