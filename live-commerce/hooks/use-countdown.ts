"use client";

import { useEffect, useState } from "react";
import { serverNow } from "./use-server-clock";

/** Milliseconds left until `endsAt` on the server clock, updated ~10×/s. */
export function useCountdown(endsAt: string | null): number | null {
  const target = endsAt ? new Date(endsAt).getTime() : null;
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (target == null) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, target - serverNow()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [target]);

  return left;
}
