// Pure auction rules. The service applies them inside a transaction that holds
// a row lock on the product, so every decision here sees a consistent state.

/** Length of an auction once the host presses "Start". */
export const AUCTION_DURATION_MS = 30_000;
/** A bid this close to the end triggers anti-sniping... */
export const SNIPE_WINDOW_MS = 5_000;
/** ...which resets the clock to this much time left. */
export const SNIPE_RESET_MS = 10_000;
/** Minimum raise over the current highest bid: 10 PLN. */
export const MIN_INCREMENT = 1_000;
/** Quick-bid buttons in the room: +10 PLN and +20 PLN. */
export const QUICK_BID_INCREMENTS = [1_000, 2_000] as const;
/** Sanity cap on a single raise, protects against fat-finger bids. */
export const MAX_RAISE = 1_000_000;

export interface AuctionState {
  status: "draft" | "bidding_active" | "sold" | "unsold";
  sellerId: string;
  startingPrice: number;
  currentHighestBid: number | null;
  currentHighestBidderId: string | null;
  auctionEndsAt: Date | null;
}

export type BidRejection =
  | "auction_not_active"
  | "auction_ended"
  | "seller_cannot_bid"
  | "already_highest_bidder"
  | "bid_too_low"
  | "bid_too_high";

export type BidDecision =
  | { ok: true; newEndsAt: Date; extended: boolean }
  | { ok: false; reason: BidRejection; minimumBid: number };

/** The smallest bid the auction accepts right now. */
export function minimumNextBid(state: Pick<AuctionState, "startingPrice" | "currentHighestBid">): number {
  return state.currentHighestBid == null ? state.startingPrice : state.currentHighestBid + MIN_INCREMENT;
}

/**
 * Anti-sniping: a bid landing in the last SNIPE_WINDOW_MS resets the timer so
 * that SNIPE_RESET_MS remain. Earlier bids leave the end time untouched.
 */
export function endsAtAfterBid(endsAt: Date, now: Date): { endsAt: Date; extended: boolean } {
  const remaining = endsAt.getTime() - now.getTime();
  if (remaining <= SNIPE_WINDOW_MS) {
    const reset = new Date(now.getTime() + SNIPE_RESET_MS);
    if (reset > endsAt) return { endsAt: reset, extended: true };
  }
  return { endsAt, extended: false };
}

export function evaluateBid(state: AuctionState, bidderId: string, amount: number, now: Date): BidDecision {
  const minimumBid = minimumNextBid(state);
  const reject = (reason: BidRejection): BidDecision => ({ ok: false, reason, minimumBid });

  if (state.status !== "bidding_active" || !state.auctionEndsAt) return reject("auction_not_active");
  if (now >= state.auctionEndsAt) return reject("auction_ended");
  if (bidderId === state.sellerId) return reject("seller_cannot_bid");
  if (state.currentHighestBidderId === bidderId) return reject("already_highest_bidder");
  if (!Number.isInteger(amount) || amount < minimumBid) return reject("bid_too_low");
  if (amount > minimumBid + MAX_RAISE) return reject("bid_too_high");

  const { endsAt, extended } = endsAtAfterBid(state.auctionEndsAt, now);
  return { ok: true, newEndsAt: endsAt, extended };
}

/** What happens to an auction whose timer has run out. */
export function settlementOutcome(state: Pick<AuctionState, "currentHighestBidderId" | "currentHighestBid">) {
  return state.currentHighestBidderId && state.currentHighestBid != null
    ? ({ status: "sold", winnerId: state.currentHighestBidderId, finalPrice: state.currentHighestBid } as const)
    : ({ status: "unsold", winnerId: null, finalPrice: null } as const);
}

export const BID_REJECTION_MESSAGES: Record<BidRejection, string> = {
  auction_not_active: "Licytacja tego przedmiotu nie trwa.",
  auction_ended: "Licytacja już się zakończyła.",
  seller_cannot_bid: "Sprzedawca nie może licytować własnych przedmiotów.",
  already_highest_bidder: "Twoja oferta jest już najwyższa.",
  bid_too_low: "Ktoś był szybszy — oferta jest za niska.",
  bid_too_high: "Oferta przekracza maksymalne jednorazowe przebicie.",
};
