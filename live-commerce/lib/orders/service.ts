import type { Database, Queryable } from "@/lib/db/types";
import { toOrder } from "@/lib/db/mappers";
import { AppError, forbidden, notFound } from "@/lib/errors";
import {
  BLIK_DECLINE_MESSAGES,
  getPaymentProvider,
  isValidBlikCode,
  type PaymentProvider,
} from "@/lib/payments/blik";
import { createShipment } from "@/lib/shipping/inpost";
import { findPaczkomat } from "@/lib/shipping/lockers";
import type { Order, PaymentStatus, ShipmentStatus } from "@/types/domain";
import { InvalidTransitionError, transition, type OrderAction, type OrderState } from "./state-machine";

const ORDER_SELECT = `
  select o.*, p.title as product_title, p.images as product_images,
         b.username as buyer_name, s.username as seller_name
    from orders o
    join products p on p.id = o.product_id
    join users b on b.id = o.buyer_id
    join users s on s.id = o.seller_id`;

export async function getOrder(q: Queryable, orderId: string): Promise<Order | null> {
  const { rows } = await q.query(`${ORDER_SELECT} where o.id = $1`, [orderId]);
  return rows[0] ? toOrder(rows[0]) : null;
}

export async function listOrders(q: Queryable, userId: string): Promise<{ purchases: Order[]; sales: Order[] }> {
  const { rows } = await q.query(
    `${ORDER_SELECT} where o.buyer_id = $1 or o.seller_id = $1 order by o.created_at desc limit 200`,
    [userId],
  );
  const orders = rows.map(toOrder);
  return {
    purchases: orders.filter((o) => o.buyerId === userId),
    sales: orders.filter((o) => o.sellerId === userId),
  };
}

export async function listOrderEvents(q: Queryable, orderId: string) {
  const { rows } = await q.query<{ kind: string; from_state: string | null; to_state: string | null; note: string | null; created_at: Date }>(
    "select kind, from_state, to_state, note, created_at from order_events where order_id = $1 order by id",
    [orderId],
  );
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}

interface LockedOrder extends OrderState {
  id: string;
  buyerId: string;
  sellerId: string;
  trackingNumber: string | null;
}

async function lockOrder(tx: Queryable, orderId: string): Promise<LockedOrder> {
  const { rows } = await tx.query<{
    id: string;
    buyer_id: string;
    seller_id: string;
    payment_status: PaymentStatus;
    shipment_status: ShipmentStatus;
    inpost_locker_code: string | null;
    inpost_tracking_number: string | null;
  }>(
    `select id, buyer_id, seller_id, payment_status, shipment_status, inpost_locker_code, inpost_tracking_number
       from orders where id = $1 for update`,
    [orderId],
  );
  const r = rows[0];
  if (!r) throw notFound("Nie ma takiego zamówienia.");
  return {
    id: r.id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    paymentStatus: r.payment_status,
    shipmentStatus: r.shipment_status,
    inpostLockerCode: r.inpost_locker_code,
    trackingNumber: r.inpost_tracking_number,
  };
}

/** Run one state-machine step and persist it, with an audit entry. */
async function apply(
  tx: Queryable,
  order: LockedOrder,
  action: OrderAction,
  opts: { lockerCode?: string; note?: string; set?: Record<string, unknown> } = {},
): Promise<LockedOrder> {
  let next: OrderState;
  try {
    next = transition(order, action, opts.lockerCode);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      throw new AppError("invalid_order_transition", `Operacja niedozwolona: ${err.message}`, 409);
    }
    throw err;
  }

  const columns: Record<string, unknown> = {
    payment_status: next.paymentStatus,
    shipment_status: next.shipmentStatus,
    inpost_locker_code: next.inpostLockerCode,
    ...opts.set,
  };
  const keys = Object.keys(columns);
  await tx.query(
    `update orders set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = clock_timestamp()
      where id = $1`,
    [order.id, ...keys.map((k) => columns[k])],
  );

  const [from, to] =
    next.paymentStatus !== order.paymentStatus
      ? [order.paymentStatus, next.paymentStatus]
      : next.shipmentStatus !== order.shipmentStatus
        ? [order.shipmentStatus, next.shipmentStatus]
        : [order.inpostLockerCode, next.inpostLockerCode];
  await tx.query(
    "insert into order_events (order_id, kind, from_state, to_state, note) values ($1, $2, $3, $4, $5)",
    [order.id, action, from, to, opts.note ?? null],
  );
  return { ...order, ...next };
}

/** Once the money is secured and the locker is known, print the InPost label. */
async function maybeCreateLabel(tx: Queryable, order: LockedOrder): Promise<LockedOrder> {
  if (order.shipmentStatus !== "awaiting_locker" || !order.inpostLockerCode) return order;
  if (order.paymentStatus !== "escrow_hold") return order;
  const shipment = createShipment(order.inpostLockerCode);
  const next = await apply(tx, order, "create_label", {
    set: { inpost_tracking_number: shipment.trackingNumber },
    note: `Etykieta InPost ${shipment.trackingNumber} → ${shipment.lockerCode}`,
  });
  return { ...next, trackingNumber: shipment.trackingNumber };
}

export async function selectLocker(
  db: Database,
  { orderId, buyerId, lockerCode, remember }: { orderId: string; buyerId: string; lockerCode: string; remember?: boolean },
): Promise<Order> {
  const code = lockerCode.trim().toUpperCase();
  if (!findPaczkomat(code)) throw new AppError("invalid_locker", "Nie znaleziono takiego Paczkomatu.");

  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.buyerId !== buyerId) throw forbidden("To nie Twoje zamówienie.");
    const next = await apply(tx, order, "select_locker", { lockerCode: code, note: `Paczkomat ${code}` });
    await maybeCreateLabel(tx, next);
    if (remember) await tx.query("update users set default_paczkomat_id = $2 where id = $1", [buyerId, code]);
  });
  return (await getOrder(db, orderId))!;
}

export type BlikPaymentResult = { ok: true; order: Order } | { ok: false; message: string; order: Order };

/**
 * Pay for a won auction with BLIK: a 6-digit code, or OneClick with the alias
 * saved on a previous payment. Funds go straight into escrow.
 */
export async function payWithBlik(
  db: Database,
  input: { orderId: string; buyerId: string; code?: string; useAlias?: boolean; rememberAlias?: boolean },
  provider: PaymentProvider = getPaymentProvider(),
): Promise<BlikPaymentResult> {
  if (!input.useAlias && (!input.code || !isValidBlikCode(input.code))) {
    throw new AppError("invalid_blik_code", "Kod BLIK musi mieć 6 cyfr.");
  }

  // 1. Claim the order for the duration of the charge. A second tap (or a
  //    second tab) finds the claim and backs off instead of charging twice.
  const claim = await db.query<{ final_price: number; buyer_id: string; blik_alias: string | null; product_title: string }>(
    `update orders o set payment_locked_until = clock_timestamp() + interval '60 seconds'
       from users u, products p
      where o.id = $1 and u.id = o.buyer_id and p.id = o.product_id
        and o.buyer_id = $2
        and o.payment_status = 'pending_blik'
        and (o.payment_locked_until is null or o.payment_locked_until < clock_timestamp())
      returning o.final_price, o.buyer_id, u.blik_alias, p.title as product_title`,
    [input.orderId, input.buyerId],
  );
  if (!claim.rows[0]) {
    const order = await getOrder(db, input.orderId);
    if (!order) throw notFound("Nie ma takiego zamówienia.");
    if (order.buyerId !== input.buyerId) throw forbidden("To nie Twoje zamówienie.");
    if (order.paymentStatus !== "pending_blik") throw new AppError("already_paid", "To zamówienie jest już opłacone.", 409);
    throw new AppError("payment_in_progress", "Płatność jest w toku — potwierdź ją w aplikacji banku.", 409);
  }
  const { final_price, blik_alias, product_title } = claim.rows[0];
  if (input.useAlias && !blik_alias) {
    await db.query("update orders set payment_locked_until = null where id = $1", [input.orderId]);
    throw new AppError("no_blik_alias", "Nie masz zapisanego BLIK. Użyj kodu z aplikacji banku.");
  }

  // 2. Talk to the gateway without holding any database locks.
  let result;
  try {
    result = await provider.chargeBlik({
      orderId: input.orderId,
      amount: final_price,
      description: `Licytacja: ${product_title}`,
      code: input.useAlias ? undefined : input.code,
      alias: input.useAlias ? (blik_alias ?? undefined) : undefined,
      knownAlias: blik_alias,
      registerAlias: !input.useAlias && input.rememberAlias,
    });
  } catch (err) {
    await db.query("update orders set payment_locked_until = null where id = $1", [input.orderId]);
    throw err;
  }

  // 3. Record the outcome.
  if (result.status === "declined") {
    await db.transaction(async (tx) => {
      await tx.query("update orders set payment_locked_until = null where id = $1", [input.orderId]);
      await tx.query(
        "insert into order_events (order_id, kind, note) values ($1, 'payment_declined', $2)",
        [input.orderId, result.reason],
      );
    });
    return { ok: false, message: BLIK_DECLINE_MESSAGES[result.reason], order: (await getOrder(db, input.orderId))! };
  }

  await db.transaction(async (tx) => {
    let order = await lockOrder(tx, input.orderId);
    order = await apply(tx, order, "confirm_payment", {
      set: { payment_reference: result.reference, paid_at: new Date(), payment_locked_until: null },
      note: `BLIK ${input.useAlias ? "OneClick" : "kod"} · ${result.reference}`,
    });
    order = await apply(tx, order, "hold_in_escrow", { note: "Środki zablokowane do potwierdzenia odbioru" });
    await maybeCreateLabel(tx, order);
    if (result.alias && result.alias !== blik_alias) {
      await tx.query("update users set blik_alias = $2 where id = $1", [input.buyerId, result.alias]);
    }
  });
  return { ok: true, order: (await getOrder(db, input.orderId))! };
}

/** Seller has dropped the parcel into a Paczkomat / handed it to a courier. */
export async function dispatchOrder(db: Database, { orderId, sellerId }: { orderId: string; sellerId: string }) {
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.sellerId !== sellerId) throw forbidden("To nie Twoja sprzedaż.");
    await apply(tx, order, "dispatch", { note: "Paczka nadana" });
  });
  return (await getOrder(db, orderId))!;
}

/** InPost status update (webhook). */
export async function applyInpostStatus(
  db: Database,
  { trackingNumber, status }: { trackingNumber: string; status: "ready_to_pickup" | "delivered" },
) {
  const { rows } = await db.query<{ id: string }>("select id from orders where inpost_tracking_number = $1", [
    trackingNumber,
  ]);
  if (!rows[0]) throw notFound("Nieznany numer przesyłki.");
  const orderId = rows[0].id;
  await db.transaction(async (tx) => {
    let order = await lockOrder(tx, orderId);
    if (order.shipmentStatus === "in_transit") {
      order = await apply(tx, order, "arrive_at_locker", { note: "InPost: paczka czeka w Paczkomacie" });
    }
    if (status === "delivered") await completeDelivery(tx, order, "InPost: paczka odebrana");
  });
  return (await getOrder(db, orderId))!;
}

/** The buyer confirms they collected the parcel: escrow is released. */
export async function confirmDelivery(db: Database, { orderId, buyerId }: { orderId: string; buyerId: string }) {
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.buyerId !== buyerId) throw forbidden("To nie Twoje zamówienie.");
    await completeDelivery(tx, order, "Kupujący potwierdził odbiór");
  });
  return (await getOrder(db, orderId))!;
}

async function completeDelivery(tx: Queryable, order: LockedOrder, note: string) {
  const now = new Date();
  const delivered = await apply(tx, order, "confirm_delivery", { set: { delivery_confirmed_at: now }, note });
  await apply(tx, delivered, "release_escrow", {
    set: { escrow_released_at: now },
    note: "Środki wypłacone sprzedawcy",
  });
}
