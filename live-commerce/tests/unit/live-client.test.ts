import { describe, expect, it } from "vitest";
import { estimateClockOffset } from "@/lib/clock";
import { activeProduct, applyLiveEvent, roomFromSnapshot } from "@/lib/live/room-state";
import type { Bid, LiveEvent, Product, RoomSnapshot } from "@/types/domain";

describe("estimateClockOffset", () => {
  it("assumes the server stamped mid-flight and trusts the fastest round trip", () => {
    const est = estimateClockOffset([
      { sentAt: 1_000, serverTime: 6_200, receivedAt: 1_400 }, // rtt 400
      { sentAt: 2_000, serverTime: 7_050, receivedAt: 2_100 }, // rtt 100 → offset 5_000
      { sentAt: 3_000, serverTime: 8_300, receivedAt: 3_300 }, // rtt 300
    ]);
    expect(est).toEqual({ offset: 5_000, rtt: 100 });
  });

  it("works for a client clock that runs ahead, and ignores bogus samples", () => {
    expect(estimateClockOffset([{ sentAt: 10_000, serverTime: 7_000, receivedAt: 10_200 }])).toEqual({
      offset: -3_100,
      rtt: 200,
    });
    expect(estimateClockOffset([{ sentAt: 5, serverTime: 1, receivedAt: 4 }])).toBeNull();
    expect(estimateClockOffset([])).toBeNull();
  });
});

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  streamId: "s1",
  title: "Pegasus",
  description: "",
  startingPrice: 5_000,
  currentHighestBid: null,
  currentHighestBidderId: null,
  currentHighestBidderName: null,
  bidCount: 0,
  status: "draft",
  images: [],
  position: 1,
  auctionEndsAt: null,
  ...over,
});

const snapshot: RoomSnapshot = {
  stream: {
    id: "s1",
    sellerId: "seller",
    sellerName: "Sklep",
    title: "Live",
    category: "Gry",
    status: "live",
    livekitRoomId: "room",
    viewerCount: 0,
    startedAt: null,
    createdAt: "2026-09-22T18:00:00.000Z",
  },
  products: [product()],
  activeProduct: null,
  recentBids: [],
  chat: [],
  serverNow: "2026-09-22T18:00:00.000Z",
};

const bidEvent = (amount: number, id: string, extended = false): LiveEvent => ({
  type: "bid.placed",
  streamId: "s1",
  productId: "p1",
  bid: { id, productId: "p1", bidderId: `u${amount}`, bidderName: `user${amount}`, amount, createdAt: "" } as Bid,
  currentHighestBid: amount,
  bidCount: amount / 1_000,
  auctionEndsAt: `2026-09-22T18:00:${String(amount / 1_000).padStart(2, "0")}.000Z`,
  extended,
  serverNow: "",
});

describe("live room state", () => {
  const started = applyLiveEvent(roomFromSnapshot(snapshot), {
    type: "auction.started",
    streamId: "s1",
    product: product({ status: "bidding_active", auctionEndsAt: "2026-09-22T18:00:30.000Z" }),
    serverNow: "",
  });

  it("tracks the active auction", () => {
    expect(activeProduct(started)).toMatchObject({ id: "p1", status: "bidding_active" });
  });

  it("applies bids and flags anti-sniping extensions", () => {
    const s = applyLiveEvent(applyLiveEvent(started, bidEvent(5_000, "b1")), bidEvent(6_000, "b2", true), 123);
    expect(activeProduct(s)).toMatchObject({ currentHighestBid: 6_000, currentHighestBidderName: "user6000", bidCount: 6 });
    expect(s.bids.map((b) => b.id)).toEqual(["b2", "b1"]);
    expect(s.extendedAt).toBe(123);
    expect(s.bidPulse).toBe(2);
  });

  it("ignores a stale bid event that arrives after a higher one", () => {
    const s = applyLiveEvent(applyLiveEvent(started, bidEvent(7_000, "b2")), bidEvent(6_000, "b1"));
    expect(activeProduct(s)!.currentHighestBid).toBe(7_000);
    expect(s.bids.map((b) => b.id)).toEqual(["b2"]);
  });

  it("clears the active auction and remembers the result on settlement", () => {
    const s = applyLiveEvent(started, {
      type: "auction.settled",
      streamId: "s1",
      productId: "p1",
      status: "sold",
      winnerId: "u1",
      winnerName: "ania",
      finalPrice: 9_000,
      orderId: "o1",
    });
    expect(activeProduct(s)).toBeNull();
    expect(s.products[0].status).toBe("sold");
    expect(s.lastResult).toMatchObject({ winnerId: "u1", orderId: "o1" });
  });

  it("does not let a stale snapshot roll back a newer bid", () => {
    const afterBid = applyLiveEvent(started, bidEvent(8_000, "b1"));
    const stale = { ...snapshot, products: [product({ status: "bidding_active", currentHighestBid: 6_000, auctionEndsAt: "x" })] };
    expect(activeProduct(roomFromSnapshot(stale, afterBid))!.currentHighestBid).toBe(8_000);
    const fresher = { ...snapshot, products: [product({ status: "bidding_active", currentHighestBid: 9_000 })] };
    expect(activeProduct(roomFromSnapshot(fresher, afterBid))!.currentHighestBid).toBe(9_000);
  });

  it("de-duplicates chat messages and updates viewers", () => {
    const msg: LiveEvent = {
      type: "chat.message",
      streamId: "s1",
      message: { id: "m1", streamId: "s1", userId: "u", userName: "ania", body: "hej", createdAt: "" },
    };
    const s = applyLiveEvent(applyLiveEvent(started, msg), msg);
    expect(s.chat).toHaveLength(1);
    expect(applyLiveEvent(s, { type: "stream.viewers", streamId: "s1", viewerCount: 42 }).stream.viewerCount).toBe(42);
  });
});
