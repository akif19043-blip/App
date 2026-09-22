"use client";

import { Clock, LocateFixed, Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Paczkomat } from "@/lib/shipping/lockers";
import { cn } from "@/lib/utils";

type Hit = Paczkomat & { distanceKm: number | null };

/**
 * Stand-in for the InPost Geowidget: search by city, street, postcode or
 * locker id, or sort by distance from the phone's location.
 */
export function PaczkomatPicker({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ q: query });
      if (near) {
        params.set("lat", String(near.lat));
        params.set("lng", String(near.lng));
      }
      try {
        const res = await fetch(`/api/inpost/lockers?${params}`, { signal: ctrl.signal });
        setHits((await res.json()).lockers);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, near]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Miasto, ulica, kod lub WAW123M"
            className="pl-9"
            aria-label="Szukaj Paczkomatu"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!navigator.geolocation) return;
            setLocating(true);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocating(false);
              },
              () => setLocating(false),
              { timeout: 8000 },
            );
          }}
          className="grid size-10 shrink-0 place-items-center rounded-md border bg-card hover:bg-accent"
          aria-label="Najbliższe Paczkomaty"
          title="Najbliższe"
        >
          {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
        </button>
      </div>

      <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1" role="listbox" aria-label="Paczkomaty">
        {loading && hits.length === 0 && <li className="p-3 text-sm text-muted-foreground">Szukam…</li>}
        {!loading && hits.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nic nie znaleziono.</li>}
        {hits.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected === p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-accent/60",
                selected === p.id && "border-inpost bg-inpost/15 ring-2 ring-inpost",
              )}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {p.id}
                  <span className="ml-2 font-normal text-muted-foreground">{p.city}</span>
                </p>
                <p className="truncate text-sm">{p.street}</p>
                <p className="truncate text-xs text-muted-foreground">{p.description}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                {p.distanceKm != null && <p className="font-semibold text-foreground">{p.distanceKm.toFixed(1)} km</p>}
                <p className="flex items-center gap-1">
                  <Clock className="size-3" /> {p.open247 ? "24/7" : "6–22"}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
