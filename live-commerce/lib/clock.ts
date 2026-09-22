export interface ClockSample {
  /** Client time when the request was sent. */
  sentAt: number;
  /** Server time in the response. */
  serverTime: number;
  /** Client time when the response arrived. */
  receivedAt: number;
}

/**
 * NTP-style offset estimate: assume the server stamped its time halfway
 * through the round trip, and trust the sample with the shortest round trip
 * (least room for asymmetric delay). serverNow ≈ Date.now() + offset.
 */
export function estimateClockOffset(samples: ClockSample[]): { offset: number; rtt: number } | null {
  let best: { offset: number; rtt: number } | null = null;
  for (const s of samples) {
    const rtt = s.receivedAt - s.sentAt;
    if (rtt < 0) continue;
    const offset = s.serverTime - (s.sentAt + rtt / 2);
    if (!best || rtt < best.rtt) best = { offset, rtt };
  }
  return best;
}
