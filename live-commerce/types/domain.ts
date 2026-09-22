// Shared domain types. Money is always an integer number of grosze.

export type UserRole = "buyer" | "seller" | "admin";
export type StreamStatus = "upcoming" | "live" | "ended";
export type ProductStatus = "draft" | "bidding_active" | "sold" | "unsold";
export type PaymentStatus = "pending_blik" | "paid" | "escrow_hold" | "released";
export type ShipmentStatus =
  | "awaiting_locker"
  | "label_created"
  | "in_transit"
  | "ready_for_pickup"
  | "delivered";

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  blikAlias: string | null;
  defaultPaczkomatId: string | null;
}

export interface Stream {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  category: string;
  status: StreamStatus;
  livekitRoomId: string;
  viewerCount: number;
  startedAt: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  streamId: string;
  title: string;
  description: string;
  startingPrice: number;
  currentHighestBid: number | null;
  currentHighestBidderId: string | null;
  currentHighestBidderName: string | null;
  bidCount: number;
  status: ProductStatus;
  images: string[];
  position: number;
  auctionEndsAt: string | null;
}

export interface Bid {
  id: string;
  productId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

export interface Order {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  finalPrice: number;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  shipmentStatus: ShipmentStatus;
  inpostLockerCode: string | null;
  inpostTrackingNumber: string | null;
  deliveryConfirmedAt: string | null;
  createdAt: string;
}

/** Everything a client needs to render a live room from scratch. */
export interface RoomSnapshot {
  stream: Stream;
  products: Product[];
  activeProduct: Product | null;
  recentBids: Bid[];
  chat: ChatMessage[];
  serverNow: string;
}

/** Messages pushed to viewers over the realtime channel. */
export type LiveEvent =
  | { type: "auction.started"; streamId: string; product: Product; serverNow: string }
  | {
      type: "bid.placed";
      streamId: string;
      bid: Bid;
      productId: string;
      currentHighestBid: number;
      bidCount: number;
      auctionEndsAt: string;
      extended: boolean;
      serverNow: string;
    }
  | {
      type: "auction.settled";
      streamId: string;
      productId: string;
      status: "sold" | "unsold";
      winnerId: string | null;
      winnerName: string | null;
      finalPrice: number | null;
      orderId: string | null;
    }
  | { type: "chat.message"; streamId: string; message: ChatMessage }
  | { type: "stream.status"; streamId: string; status: StreamStatus }
  | { type: "stream.viewers"; streamId: string; viewerCount: number }
  | { type: "products.changed"; streamId: string };
