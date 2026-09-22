import type { Bid, ChatMessage, LiveEvent, Product, RoomSnapshot, Stream } from "@/types/domain";

// Client-side room state, updated from realtime events. Pure so it can be
// unit-tested; the hook just feeds it events.

export interface LastResult {
  productId: string;
  status: "sold" | "unsold";
  winnerId: string | null;
  winnerName: string | null;
  finalPrice: number | null;
  orderId: string | null;
}

export interface RoomState {
  stream: Stream;
  products: Product[];
  activeProductId: string | null;
  bids: Bid[];
  chat: ChatMessage[];
  lastResult: LastResult | null;
  /** Bumped on every accepted bid, drives the "pop" animation. */
  bidPulse: number;
  /** Set when the anti-sniping rule just reset the clock. */
  extendedAt: number | null;
}

const MAX_CHAT = 100;
const MAX_BIDS = 20;

export function roomFromSnapshot(s: RoomSnapshot, prev?: RoomState | null): RoomState {
  // A snapshot read just before a bid committed can arrive after that bid's
  // event. Never let it roll a running auction's price back.
  const products = s.products.map((p) => {
    const old = prev?.products.find((o) => o.id === p.id);
    const newer =
      old &&
      p.status === "bidding_active" &&
      old.status === "bidding_active" &&
      (old.currentHighestBid ?? 0) > (p.currentHighestBid ?? 0);
    return newer
      ? {
          ...p,
          currentHighestBid: old.currentHighestBid,
          currentHighestBidderId: old.currentHighestBidderId,
          currentHighestBidderName: old.currentHighestBidderName,
          bidCount: old.bidCount,
          auctionEndsAt: old.auctionEndsAt,
        }
      : p;
  });
  return {
    stream: s.stream,
    products,
    activeProductId: products.find((p) => p.status === "bidding_active")?.id ?? null,
    bids: s.recentBids,
    chat: s.chat,
    lastResult: prev?.lastResult ?? null,
    bidPulse: prev?.bidPulse ?? 0,
    extendedAt: prev?.extendedAt ?? null,
  };
}

export function activeProduct(state: RoomState): Product | null {
  return state.products.find((p) => p.id === state.activeProductId) ?? null;
}

const patchProduct = (products: Product[], id: string, patch: Partial<Product>) =>
  products.map((p) => (p.id === id ? { ...p, ...patch } : p));

export function applyLiveEvent(state: RoomState, event: LiveEvent, receivedAt = Date.now()): RoomState {
  switch (event.type) {
    case "auction.started": {
      const exists = state.products.some((p) => p.id === event.product.id);
      return {
        ...state,
        products: exists ? patchProduct(state.products, event.product.id, event.product) : [...state.products, event.product],
        activeProductId: event.product.id,
        bids: [],
        lastResult: null,
        extendedAt: null,
      };
    }
    case "bid.placed": {
      const product = state.products.find((p) => p.id === event.productId);
      // Events can overtake each other in flight; the highest bid always wins.
      if (!product || (product.currentHighestBid ?? 0) >= event.currentHighestBid) return state;
      return {
        ...state,
        products: patchProduct(state.products, event.productId, {
          currentHighestBid: event.currentHighestBid,
          currentHighestBidderId: event.bid.bidderId,
          currentHighestBidderName: event.bid.bidderName,
          bidCount: event.bidCount,
          auctionEndsAt: event.auctionEndsAt,
        }),
        bids: [event.bid, ...state.bids.filter((b) => b.id !== event.bid.id)].slice(0, MAX_BIDS),
        bidPulse: state.bidPulse + 1,
        extendedAt: event.extended ? receivedAt : state.extendedAt,
      };
    }
    case "auction.settled":
      return {
        ...state,
        products: patchProduct(state.products, event.productId, { status: event.status }),
        activeProductId: state.activeProductId === event.productId ? null : state.activeProductId,
        lastResult: {
          productId: event.productId,
          status: event.status,
          winnerId: event.winnerId,
          winnerName: event.winnerName,
          finalPrice: event.finalPrice,
          orderId: event.orderId,
        },
      };
    case "chat.message":
      if (state.chat.some((m) => m.id === event.message.id)) return state;
      return { ...state, chat: [...state.chat, event.message].slice(-MAX_CHAT) };
    case "stream.status":
      return { ...state, stream: { ...state.stream, status: event.status } };
    case "stream.viewers":
      return { ...state, stream: { ...state.stream, viewerCount: event.viewerCount } };
    case "products.changed":
      return state; // the hook refetches the snapshot
  }
}
