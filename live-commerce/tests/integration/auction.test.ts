import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { placeBid, settleAuction, settleExpiredAuctions, startAuction } from "@/lib/auction/service";
import { AUCTION_DURATION_MS, SNIPE_RESET_MS } from "@/lib/auction/rules";
import { LIVE_CHANNEL } from "@/lib/realtime/notify";
import { addProduct, createStream, getRoomSnapshot, listStreams, setStreamStatus } from "@/lib/streams/service";
import type { LiveEvent } from "@/types/domain";
import { createTestDb, makeUser, remainingMs, setRemaining } from "../helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let seller: string;
let buyers: string[];
let streamId: string;
let productId: string;
const events: LiveEvent[] = [];

beforeAll(async () => {
  db = await createTestDb();
  seller = await makeUser(db, "sklep", "seller");
  buyers = [];
  for (let i = 0; i < 25; i++) buyers.push(await makeUser(db, `kupiec${i}`));
  await db.listen(LIVE_CHANNEL, (p) => events.push(JSON.parse(p)));
});
afterAll(() => db.destroy());

beforeEach(async () => {
  const stream = await createStream(db, seller, { title: "Test stream", category: "Testy" });
  streamId = stream.id;
  await setStreamStatus(db, { streamId, sellerId: seller, status: "live" });
  const product = await addProduct(db, seller, streamId, {
    title: "Pegasus",
    description: "",
    startingPrice: 5_000,
    images: [],
  });
  productId = product.id;
  events.length = 0;
});

const waitForEvents = () => new Promise((r) => setTimeout(r, 50));

describe("streams", () => {
  it("lists streams by status and seller, live first", async () => {
    const upcoming = await createStream(db, seller, { title: "Later", category: "Testy" });
    const listed = await listStreams(db, { status: ["live", "upcoming"], sellerId: seller });
    expect(listed[0].status).toBe("live");
    expect(listed.map((s) => s.id)).toEqual(expect.arrayContaining([streamId, upcoming.id]));
    expect(await listStreams(db, { status: ["ended"] })).toEqual([]);
    expect((await listStreams(db)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("starting an auction", () => {
  it("runs for 30 seconds on the database clock", async () => {
    const product = await startAuction(db, { productId, sellerId: seller });
    expect(product.status).toBe("bidding_active");
    const left = await remainingMs(db, productId);
    expect(left).toBeGreaterThan(AUCTION_DURATION_MS - 2_000);
    expect(left).toBeLessThanOrEqual(AUCTION_DURATION_MS);
    await waitForEvents();
    expect(events.map((e) => e.type)).toContain("auction.started");
  });

  it("only lets the stream's seller start it, and only while live", async () => {
    await expect(startAuction(db, { productId, sellerId: buyers[0] })).rejects.toMatchObject({ code: "forbidden" });
    await setStreamStatus(db, { streamId, sellerId: seller, status: "ended" });
    await expect(startAuction(db, { productId, sellerId: seller })).rejects.toMatchObject({ code: "stream_not_live" });
  });

  it("runs one auction per stream at a time", async () => {
    const second = await addProduct(db, seller, streamId, { title: "Game Boy", description: "", startingPrice: 100, images: [] });
    const results = await Promise.allSettled([
      startAuction(db, { productId, sellerId: seller }),
      startAuction(db, { productId: second.id, sellerId: seller }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from products where stream_id = $1 and status = 'bidding_active'",
      [streamId],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("bidding", () => {
  beforeEach(() => startAuction(db, { productId, sellerId: seller }));

  it("accepts rising bids and broadcasts each one", async () => {
    expect(await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 })).toMatchObject({ ok: true });
    expect(await placeBid(db, { productId, bidderId: buyers[1], amount: 6_000 })).toMatchObject({ ok: true });
    const r = await placeBid(db, { productId, bidderId: buyers[0], amount: 8_000 });
    expect(r).toMatchObject({ ok: true, product: { currentHighestBid: 8_000, currentHighestBidderId: buyers[0], bidCount: 3 } });
    await waitForEvents();
    const bidEvents = events.filter((e) => e.type === "bid.placed");
    expect(bidEvents.map((e) => e.type === "bid.placed" && e.currentHighestBid)).toEqual([5_000, 6_000, 8_000]);
  });

  it("resolves a collision of 25 identical bids to exactly one winner", async () => {
    await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 });
    // Everyone else taps "+10 zł" on the same screen state at the same moment.
    const results = await Promise.all(
      buyers.slice(1).map((bidderId) => placeBid(db, { productId, bidderId, amount: 6_000 })),
    );
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(23);
    for (const l of losers) {
      expect(l).toMatchObject({ ok: false, reason: "bid_too_low", minimumBid: 7_000 });
    }

    const { rows } = await db.query<{ n: number; max: number }>(
      "select count(*)::int as n, max(amount) as max from bids where product_id = $1",
      [productId],
    );
    expect(rows[0]).toEqual({ n: 2, max: 6_000 });
    const snap = await getRoomSnapshot(db, streamId);
    expect(snap!.activeProduct).toMatchObject({ currentHighestBid: 6_000, bidCount: 2 });
    expect(snap!.activeProduct!.currentHighestBidderId).toBe(winners[0].ok && winners[0].bid.bidderId);
  });

  it("keeps the ledger consistent under a storm of mixed bids", async () => {
    // 25 bidders, each trying three different amounts at once.
    const attempts = buyers.flatMap((bidderId, i) =>
      [0, 1, 2].map((k) => placeBid(db, { productId, bidderId, amount: 5_000 + ((i * 3 + k) % 20) * 1_000 })),
    );
    await Promise.all(attempts);
    const { rows } = await db.query<{ amount: number; bidder_id: string }>(
      "select amount, bidder_id from bids where product_id = $1 order by created_at, amount",
      [productId],
    );
    // Strictly increasing by at least the minimum raise, never the same bidder twice in a row.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].amount - rows[i - 1].amount).toBeGreaterThanOrEqual(1_000);
      expect(rows[i].bidder_id).not.toBe(rows[i - 1].bidder_id);
    }
    const snap = await getRoomSnapshot(db, streamId);
    expect(snap!.activeProduct!.currentHighestBid).toBe(rows.at(-1)!.amount);
    expect(snap!.activeProduct!.bidCount).toBe(rows.length);
  });

  it("rejects the seller, the current leader, and late bids", async () => {
    expect(await placeBid(db, { productId, bidderId: seller, amount: 5_000 })).toMatchObject({ reason: "seller_cannot_bid" });
    await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 });
    expect(await placeBid(db, { productId, bidderId: buyers[0], amount: 7_000 })).toMatchObject({
      reason: "already_highest_bidder",
    });
    await setRemaining(db, productId, -1);
    expect(await placeBid(db, { productId, bidderId: buyers[1], amount: 9_000 })).toMatchObject({ reason: "auction_ended" });
  });
});

describe("anti-sniping", () => {
  beforeEach(() => startAuction(db, { productId, sellerId: seller }));

  it("does not touch the timer for an early bid", async () => {
    const r = await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 });
    expect(r).toMatchObject({ ok: true, extended: false });
    expect(await remainingMs(db, productId)).toBeGreaterThan(20_000);
  });

  it("resets the timer to 10 seconds for a bid in the last 5 seconds", async () => {
    await setRemaining(db, productId, 3_000);
    const r = await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 });
    expect(r).toMatchObject({ ok: true, extended: true });
    const left = await remainingMs(db, productId);
    expect(left).toBeGreaterThan(SNIPE_RESET_MS - 1_000);
    expect(left).toBeLessThanOrEqual(SNIPE_RESET_MS);

    await waitForEvents();
    const bid = events.find((e) => e.type === "bid.placed");
    expect(bid).toMatchObject({ extended: true });
  });

  it("keeps extending through a bidding war at the buzzer", async () => {
    for (let i = 0; i < 4; i++) {
      await setRemaining(db, productId, 1_000);
      const r = await placeBid(db, { productId, bidderId: buyers[i % 2], amount: 5_000 + i * 1_000 });
      expect(r).toMatchObject({ ok: true, extended: true });
    }
    expect(await remainingMs(db, productId)).toBeGreaterThan(SNIPE_RESET_MS - 1_000);
  });
});

describe("settlement", () => {
  beforeEach(() => startAuction(db, { productId, sellerId: seller }));

  it("does nothing while the timer is still running", async () => {
    expect(await settleAuction(db, productId)).toBeNull();
  });

  it("reserves the winning bid as an order when the timer expires", async () => {
    await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 });
    await placeBid(db, { productId, bidderId: buyers[1], amount: 7_000 });
    await setRemaining(db, productId, -10);

    // The sweeper closes every expired auction (including leftovers from other tests).
    const settled = (await settleExpiredAuctions(db)).find((r) => r.productId === productId)!;
    expect(settled).toMatchObject({ productId, status: "sold", winnerId: buyers[1], finalPrice: 7_000 });

    const { rows } = await db.query("select buyer_id, seller_id, final_price, payment_status from orders where product_id = $1", [
      productId,
    ]);
    expect(rows).toEqual([{ buyer_id: buyers[1], seller_id: seller, final_price: 7_000, payment_status: "pending_blik" }]);
    await waitForEvents();
    expect(events.find((e) => e.type === "auction.settled" && e.productId === productId)).toMatchObject({
      status: "sold",
      winnerId: buyers[1],
      orderId: settled.orderId,
    });
  });

  it("is idempotent when many callers race to settle", async () => {
    await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 });
    await setRemaining(db, productId, -10);
    const results = await Promise.all(Array.from({ length: 10 }, () => settleAuction(db, productId)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from orders where product_id = $1", [productId]);
    expect(rows[0].n).toBe(1);
  });

  it("marks an auction with no bids unsold and allows re-listing it", async () => {
    await setRemaining(db, productId, -10);
    expect(await settleAuction(db, productId)).toMatchObject({ status: "unsold", orderId: null });
    const again = await startAuction(db, { productId, sellerId: seller });
    expect(again.status).toBe("bidding_active");
  });

  it("does not let a sold item be auctioned again", async () => {
    await placeBid(db, { productId, bidderId: buyers[0], amount: 5_000 });
    await setRemaining(db, productId, -10);
    await settleAuction(db, productId);
    await expect(startAuction(db, { productId, sellerId: seller })).rejects.toMatchObject({ code: "product_not_startable" });
  });
});
