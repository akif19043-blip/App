import type { Bid, ChatMessage, Order, Product, Stream, User } from "@/types/domain";

// Row → domain object. Timestamps leave the server as ISO strings.

type Row = Record<string, unknown>;

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string | Date).toISOString());
const isoNN = (v: unknown): string => new Date(v as string | Date).toISOString();

export function toUser(r: Row): User {
  return {
    id: r.id as string,
    email: r.email as string,
    username: r.username as string,
    role: r.role as User["role"],
    blikAlias: (r.blik_alias as string | null) ?? null,
    defaultPaczkomatId: (r.default_paczkomat_id as string | null) ?? null,
  };
}

export function toStream(r: Row): Stream {
  return {
    id: r.id as string,
    sellerId: r.seller_id as string,
    sellerName: (r.seller_name as string) ?? "",
    title: r.title as string,
    category: r.category as string,
    status: r.status as Stream["status"],
    livekitRoomId: r.livekit_room_id as string,
    viewerCount: r.viewer_count as number,
    startedAt: iso(r.started_at),
    createdAt: isoNN(r.created_at),
  };
}

export function toProduct(r: Row): Product {
  return {
    id: r.id as string,
    streamId: r.stream_id as string,
    title: r.title as string,
    description: r.description as string,
    startingPrice: r.starting_price as number,
    currentHighestBid: (r.current_highest_bid as number | null) ?? null,
    currentHighestBidderId: (r.current_highest_bidder_id as string | null) ?? null,
    currentHighestBidderName: (r.bidder_name as string | null) ?? null,
    bidCount: r.bid_count as number,
    status: r.status as Product["status"],
    images: (r.images as string[]) ?? [],
    position: r.position as number,
    auctionEndsAt: iso(r.auction_ends_at),
  };
}

export function toBid(r: Row): Bid {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    bidderId: r.bidder_id as string,
    bidderName: (r.bidder_name as string) ?? "",
    amount: r.amount as number,
    createdAt: isoNN(r.created_at),
  };
}

export function toChat(r: Row): ChatMessage {
  return {
    id: r.id as string,
    streamId: r.stream_id as string,
    userId: r.user_id as string,
    userName: (r.user_name as string) ?? "",
    body: r.body as string,
    createdAt: isoNN(r.created_at),
  };
}

export function toOrder(r: Row): Order {
  const images = (r.product_images as string[] | null) ?? [];
  return {
    id: r.id as string,
    productId: r.product_id as string,
    productTitle: (r.product_title as string) ?? "",
    productImage: images[0] ?? null,
    buyerId: r.buyer_id as string,
    buyerName: (r.buyer_name as string) ?? "",
    sellerId: r.seller_id as string,
    sellerName: (r.seller_name as string) ?? "",
    finalPrice: r.final_price as number,
    paymentStatus: r.payment_status as Order["paymentStatus"],
    paymentReference: (r.payment_reference as string | null) ?? null,
    shipmentStatus: r.shipment_status as Order["shipmentStatus"],
    inpostLockerCode: (r.inpost_locker_code as string | null) ?? null,
    inpostTrackingNumber: (r.inpost_tracking_number as string | null) ?? null,
    deliveryConfirmedAt: iso(r.delivery_confirmed_at),
    createdAt: isoNN(r.created_at),
  };
}
