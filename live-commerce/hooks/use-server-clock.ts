"use client";

import { useEffect, useSyncExternalStore } from "react";
import { estimateClockOffset, type ClockSample } from "@/lib/clock";

// One shared estimate for the whole tab. Countdown timers render
// `endsAt - serverNow()`, so every viewer sees the same number of seconds
// left no matter how wrong their phone's clock is.

let offset = 0;
let synced = false;
let syncing: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function sync() {
  const samples: ClockSample[] = [];
  for (let i = 0; i < 4; i++) {
    const sentAt = Date.now();
    try {
      const res = await fetch("/api/time", { cache: "no-store" });
      const { now } = (await res.json()) as { now: number };
      samples.push({ sentAt, serverTime: now, receivedAt: Date.now() });
    } catch {
      /* offline: keep the previous estimate */
    }
  }
  const est = estimateClockOffset(samples);
  if (est) {
    offset = est.offset;
    synced = true;
    listeners.forEach((l) => l());
  }
}

export function serverNow(): number {
  return Date.now() + offset;
}

/** Keeps the offset fresh; returns whether it has been measured yet. */
export function useServerClock(): boolean {
  useEffect(() => {
    syncing ??= sync().finally(() => (syncing = null));
    const id = setInterval(() => {
      syncing ??= sync().finally(() => (syncing = null));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => synced,
    () => false,
  );
}
