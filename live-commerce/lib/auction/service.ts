import type { Database, Queryable } from "@/lib/db/types";
import { toProduct } from "@/lib/db/mappers";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { publish } from "@/lib/realtime/notify";
import type { Bid, Product } from "@/types/domain";
import {
  AUCTION_DURATION_MS,
  BID_REJECTION_MESSAGES,
  evaluateBid,
  settlementOutcome,
  type AuctionState,
  type BidRejection,
} from "./rules";

// All timing uses the database clock, so several app instances agree on when
// an auction ends regardless of their own clocks.

async function dbNow(q: Queryable): Promise<Date> {
  // Read after taking row locks: time spent waiting for a lock must count.
  const { rows } = await q.query<{ now: Date }>("select clock_timestamp() as now");
  return new Date(rows[0].now);
}

export async function getProduct(q: Queryable, productId: string): Promise<Product | null> {
  const { rows } = await q.query(
    `select p.*, u.username as bidder_name
       from products p left join users u on u.id = p.current_highest_bidder_id
      where p.id = $1`,
    [productId],
  );
  return rows[0] ? toProduct(rows[0]) : null;
}

/** Host presses "Start": the product goes under the hammer for 30 seconds. */
export async function startAuction(
  db: Database,
  { productId, sellerId }: { productId: string; sellerId: string },
): Promise<Product> {
  return db.transaction(async (tx) => {
    // Lock the stream too, so two "Start" presses cannot both pass the
    // one-auction-at-a-time check.
    const { rows } = await tx.query<{
      status: Product["status"];
      stream_id: string;
      seller_id: string;
      stream_status: string;
    }>(
      `select p.status, p.stream_id, s.seller_id, s.status as stream_status
         from products p join streams s on s.id = p.stream_id
        where p.id = $1
        for update of p, s`,
      [productId],
    );
    const row = rows[0];
    if (!row) throw notFound("Nie ma takiego przedmiotu.");
    if (row.seller_id !== sellerId) throw forbidden("To nie Twój przedmiot.");
    if (row.stream_status !== "live") throw new AppError("stream_not_live", "Najpierw rozpocznij transmisję.", 409);
    if (row.status !== "draft" && row.status !== "unsold") {
      throw new AppError("product_not_startable", "Ten przedmiot był już licytowany.", 409);
    }

    const active = await tx.query(
      "select 1 from products where stream_id = $1 and status = 'bidding_active'",
      [row.stream_id],
    );
    if (active.rows.length) {
      throw new AppError("auction_in_progress", "Poczekaj, aż skończy się bieżąca licytacja.", 409);
    }

    const now = await dbNow(tx);
    await tx.query(
      `update products
          set status = 'bidding_active',
              auction_started_at = $2,
              auction_ends_at = $2::timestamptz + $3::int * interval '1 millisecond',
              current_highest_bid = null,
              current_highest_bidder_id = null,
              bid_count = 0
        where id = $1`,
      [productId, now, AUCTION_DURATION_MS],
    );
    const product = (await getProduct(tx, productId))!;
    await publish(tx, { type: "auction.started", streamId: row.stream_id, product, serverNow: now.toISOString() });
    return product;
  });
}

export type PlaceBidResult =
  | { ok: true; bid: Bid; product: Product; extended: boolean }
  | { ok: false; reason: BidRejection; message: string; minimumBid: number; product: Product };

/**
 * Place a bid. Concurrent bids on one product serialise on the product row
 * lock; each one is judged against the state left by the previous, so of two
 * identical "+10 zł" taps exactly one wins and the other is told it was late.
 */
export async function placeBid(
  db: Database,
  { productId, bidderId, amount }: { productId: string; bidderId: string; amount: number },
): Promise<PlaceBidResult> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      status: AuctionState["status"];
      stream_id: string;
      seller_id: string;
      starting_price: number;
      current_highest_bid: number | null;
      current_highest_bidder_id: string | null;
      auction_ends_at: Date | null;
    }>(
      `select p.status, p.stream_id, s.seller_id, p.starting_price,
              p.current_highest_bid, p.current_highest_bidder_id, p.auction_ends_at
         from products p join streams s on s.id = p.stream_id
        where p.id = $1
        for update of p`,
      [productId],
    );
    const row = rows[0];
    if (!row) throw notFound("Nie ma takiego przedmiotu.");

    const now = await dbNow(tx);
    const decision = evaluateBid(
      {
        status: row.status,
        sellerId: row.seller_id,
        startingPrice: row.starting_price,
        currentHighestBid: row.current_highest_bid,
        currentHighestBidderId: row.current_highest_bidder_id,
        auctionEndsAt: row.auction_ends_at ? new Date(row.auction_ends_at) : null,
      },
      bidderId,
      amount,
      now,
    );

    if (!decision.ok) {
      return {
        ok: false,
        reason: decision.reason,
        message: BID_REJECTION_MESSAGES[decision.reason],
        minimumBid: decision.minimumBid,
        product: (await getProduct(tx, productId))!,
      };
    }

    await tx.query(
      `update products
          set current_highest_bid = $2, current_highest_bidder_id = $3,
              bid_count = bid_count + 1, auction_ends_at = $4
        where id = $1`,
      [productId, amount, bidderId, decision.newEndsAt],
    );
    const inserted = await tx.query<{ id: string; created_at: Date; bidder_name: string }>(
      `insert into bids (product_id, bidder_id, amount, created_at) values ($1, $2, $3, $4)
       returning id, created_at, (select username from users where id = $2) as bidder_name`,
      [productId, bidderId, amount, now],
    );
    const b = inserted.rows[0];
    const bid: Bid = {
      id: b.id,
      productId,
      bidderId,
      bidderName: b.bidder_name,
      amount,
      createdAt: new Date(b.created_at).toISOString(),
    };
    const product = (await getProduct(tx, productId))!;

    await publish(tx, {
      type: "bid.placed",
      streamId: row.stream_id,
      productId,
      bid,
      currentHighestBid: amount,
      bidCount: product.bidCount,
      auctionEndsAt: decision.newEndsAt.toISOString(),
      extended: decision.extended,
      serverNow: now.toISOString(),
    });
    return { ok: true, bid, product, extended: decision.extended };
  });
}

export interface SettlementResult {
  productId: string;
  status: "sold" | "unsold";
  orderId: string | null;
  winnerId: string | null;
  finalPrice: number | null;
}

/**
 * Close one auction if its timer has run out. Idempotent and safe to call
 * from anywhere (sweeper, clients hitting zero, cron): the first caller wins,
 * everyone else gets null. The winning bid is reserved as a new order.
 */
export async function settleAuction(db: Database, productId: string): Promise<SettlementResult | null> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      status: string;
      stream_id: string;
      seller_id: string;
      current_highest_bid: number | null;
      current_highest_bidder_id: string | null;
      auction_ends_at: Date | null;
      bidder_name: string | null;
    }>(
      `select p.status, p.stream_id, s.seller_id, p.current_highest_bid,
              p.current_highest_bidder_id, p.auction_ends_at,
              (select username from users u where u.id = p.current_highest_bidder_id) as bidder_name
         from products p join streams s on s.id = p.stream_id
        where p.id = $1
        for update of p skip locked`,
      [productId],
    );
    const row = rows[0];
    // Missing, busy (a bid is being placed right now), or already closed.
    if (!row || row.status !== "bidding_active" || !row.auction_ends_at) return null;
    const now = await dbNow(tx);
    if (now < new Date(row.auction_ends_at)) return null;

    const outcome = settlementOutcome({
      currentHighestBid: row.current_highest_bid,
      currentHighestBidderId: row.current_highest_bidder_id,
    });
    await tx.query("update products set status = $2 where id = $1", [productId, outcome.status]);

    let orderId: string | null = null;
    if (outcome.status === "sold") {
      const order = await tx.query<{ id: string }>(
        `insert into orders (product_id, buyer_id, seller_id, final_price)
         values ($1, $2, $3, $4)
         on conflict (product_id) do nothing
         returning id`,
        [productId, outcome.winnerId, row.seller_id, outcome.finalPrice],
      );
      orderId = order.rows[0]?.id ?? null;
      if (orderId) {
        await tx.query(
          `insert into order_events (order_id, kind, to_state, note)
           values ($1, 'created', 'pending_blik', 'Zwycięska oferta zarezerwowana')`,
          [orderId],
        );
      }
    }

    await publish(tx, {
      type: "auction.settled",
      streamId: row.stream_id,
      productId,
      status: outcome.status,
      winnerId: outcome.winnerId,
      winnerName: row.bidder_name,
      finalPrice: outcome.finalPrice,
      orderId,
    });
    return { productId, orderId, ...outcome };
  });
}

/** Settle every auction whose timer has expired. Returns what was closed. */
export async function settleExpiredAuctions(db: Database, limit = 50): Promise<SettlementResult[]> {
  const { rows } = await db.query<{ id: string }>(
    `select id from products
      where status = 'bidding_active' and auction_ends_at <= clock_timestamp()
      order by auction_ends_at
      limit $1`,
    [limit],
  );
  const results: SettlementResult[] = [];
  for (const { id } of rows) {
    const r = await settleAuction(db, id);
    if (r) results.push(r);
  }
  return results;
}
