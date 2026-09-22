import { describe, expect, it } from "vitest";
import {
  AUCTION_DURATION_MS,
  endsAtAfterBid,
  evaluateBid,
  MIN_INCREMENT,
  minimumNextBid,
  settlementOutcome,
  SNIPE_RESET_MS,
  SNIPE_WINDOW_MS,
  type AuctionState,
} from "@/lib/auction/rules";

const t0 = new Date("2026-09-22T18:00:00.000Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

const active = (over: Partial<AuctionState> = {}): AuctionState => ({
  status: "bidding_active",
  sellerId: "seller",
  startingPrice: 5_000,
  currentHighestBid: null,
  currentHighestBidderId: null,
  auctionEndsAt: at(AUCTION_DURATION_MS),
  ...over,
});

describe("minimumNextBid", () => {
  it("is the starting price before the first bid", () => {
    expect(minimumNextBid({ startingPrice: 5_000, currentHighestBid: null })).toBe(5_000);
  });
  it("is the current bid plus 10 zł afterwards", () => {
    expect(minimumNextBid({ startingPrice: 5_000, currentHighestBid: 7_000 })).toBe(7_000 + MIN_INCREMENT);
  });
});

describe("anti-sniping", () => {
  const endsAt = at(30_000);

  it("leaves the timer alone for bids before the last 5 seconds", () => {
    expect(endsAtAfterBid(endsAt, at(10_000))).toEqual({ endsAt, extended: false });
    expect(endsAtAfterBid(endsAt, at(30_000 - SNIPE_WINDOW_MS - 1))).toEqual({ endsAt, extended: false });
  });

  it("resets to 10 seconds for a bid exactly at the 5 second mark", () => {
    const now = at(30_000 - SNIPE_WINDOW_MS);
    expect(endsAtAfterBid(endsAt, now)).toEqual({ endsAt: at(30_000 - SNIPE_WINDOW_MS + SNIPE_RESET_MS), extended: true });
  });

  it("resets to 10 seconds for a last-millisecond bid", () => {
    const now = at(29_999);
    const r = endsAtAfterBid(endsAt, now);
    expect(r.extended).toBe(true);
    expect(r.endsAt.getTime() - now.getTime()).toBe(SNIPE_RESET_MS);
  });

  it("keeps resetting for consecutive snipes", () => {
    let end = endsAt;
    for (const ms of [26_000, 34_000, 42_500]) {
      const r = endsAtAfterBid(end, at(ms));
      expect(r.extended).toBe(true);
      expect(r.endsAt).toEqual(at(ms + SNIPE_RESET_MS));
      end = r.endsAt;
    }
  });
});

describe("evaluateBid", () => {
  it("accepts a valid first bid at the starting price", () => {
    expect(evaluateBid(active(), "ania", 5_000, at(1_000))).toEqual({
      ok: true,
      newEndsAt: at(AUCTION_DURATION_MS),
      extended: false,
    });
  });

  it("extends the auction for a bid in the snipe window", () => {
    const r = evaluateBid(active(), "ania", 5_000, at(27_000));
    expect(r).toEqual({ ok: true, newEndsAt: at(27_000 + SNIPE_RESET_MS), extended: true });
  });

  it.each([
    ["auction_not_active", active({ status: "draft", auctionEndsAt: null }), "ania", 5_000, at(0)],
    ["auction_not_active", active({ status: "sold" }), "ania", 9_000, at(0)],
    ["auction_ended", active(), "ania", 5_000, at(AUCTION_DURATION_MS)],
    ["seller_cannot_bid", active(), "seller", 5_000, at(0)],
    [
      "already_highest_bidder",
      active({ currentHighestBid: 6_000, currentHighestBidderId: "ania" }),
      "ania",
      7_000,
      at(0),
    ],
    ["bid_too_low", active(), "ania", 4_999, at(0)],
    ["bid_too_low", active({ currentHighestBid: 6_000, currentHighestBidderId: "tomek" }), "ania", 6_500, at(0)],
    ["bid_too_low", active(), "ania", 5_000.5, at(0)],
    ["bid_too_high", active(), "ania", 5_000 + 1_000_001, at(0)],
  ] as const)("rejects with %s", (reason, state, bidder, amount, now) => {
    const r = evaluateBid(state, bidder, amount, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it("reports the minimum bid on rejection so the client can retry", () => {
    const r = evaluateBid(active({ currentHighestBid: 6_000, currentHighestBidderId: "tomek" }), "ania", 6_000, at(0));
    expect(r).toMatchObject({ ok: false, reason: "bid_too_low", minimumBid: 7_000 });
  });
});

describe("settlementOutcome", () => {
  it("sells to the highest bidder", () => {
    expect(settlementOutcome({ currentHighestBid: 9_000, currentHighestBidderId: "ania" })).toEqual({
      status: "sold",
      winnerId: "ania",
      finalPrice: 9_000,
    });
  });
  it("marks an auction without bids unsold", () => {
    expect(settlementOutcome({ currentHighestBid: null, currentHighestBidderId: null })).toEqual({
      status: "unsold",
      winnerId: null,
      finalPrice: null,
    });
  });
});
