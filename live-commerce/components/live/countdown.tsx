"use client";

import { cn } from "@/lib/utils";
import { AUCTION_DURATION_MS, SNIPE_WINDOW_MS } from "@/lib/auction/rules";

/** Circular timer. Red and pulsing inside the anti-sniping window. */
export function Countdown({ msLeft, extended }: { msLeft: number | null; extended: boolean }) {
  const seconds = msLeft == null ? 0 : Math.ceil(msLeft / 1000);
  const fraction = msLeft == null ? 0 : Math.min(1, msLeft / AUCTION_DURATION_MS);
  const danger = msLeft != null && msLeft <= SNIPE_WINDOW_MS;
  const r = 26;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative grid size-16 shrink-0 place-items-center" role="timer" aria-live="off" aria-label={`${seconds} sekund`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-white/15" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className={cn("transition-[stroke-dashoffset] duration-100 ease-linear", danger ? "stroke-red-500" : "stroke-emerald-400")}
        />
      </svg>
      <span className={cn("text-xl font-black tabular-nums", danger && "animate-pulse text-red-400")}>{seconds}</span>
      {extended && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 animate-slide-up rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-black">
          +10 s
        </span>
      )}
    </div>
  );
}
