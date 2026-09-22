import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { placeBid, settleAuction, startAuction } from "@/lib/auction/service";
import {
  applyInpostStatus,
  confirmDelivery,
  dispatchOrder,
  getOrder,
  listOrderEvents,
  payWithBlik,
  selectLocker,
} from "@/lib/orders/service";
import { MockPrzelewy24Provider, type PaymentProvider } from "@/lib/payments/blik";
import { addProduct, createStream, setStreamStatus } from "@/lib/streams/service";
import { createTestDb, makeUser, setRemaining } from "../helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let seller: string;
let buyer: string;
let other: string;
let orderId: string;
const p24 = new MockPrzelewy24Provider(0);

beforeAll(async () => {
  db = await createTestDb();
  seller = await makeUser(db, "sklep", "seller");
  buyer = await makeUser(db, "ania");
  other = await makeUser(db, "tomek");
});
afterAll(() => db.destroy());

/** A fresh won auction → pending order for `buyer` at 120 zł. */
beforeEach(async () => {
  const stream = await createStream(db, seller, { title: "Stream", category: "Testy" });
  await setStreamStatus(db, { streamId: stream.id, sellerId: seller, status: "live" });
  const product = await addProduct(db, seller, stream.id, { title: "Game Boy", description: "", startingPrice: 10_000, images: [] });
  await startAuction(db, { productId: product.id, sellerId: seller });
  await placeBid(db, { productId: product.id, bidderId: other, amount: 11_000 });
  await placeBid(db, { productId: product.id, bidderId: buyer, amount: 12_000 });
  await setRemaining(db, product.id, -1);
  orderId = (await settleAuction(db, product.id))!.orderId!;
});

describe("checkout: Paczkomat + BLIK", () => {
  it("starts reserved and waiting for BLIK", async () => {
    expect(await getOrder(db, orderId)).toMatchObject({
      buyerId: buyer,
      sellerId: seller,
      finalPrice: 12_000,
      paymentStatus: "pending_blik",
      shipmentStatus: "awaiting_locker",
    });
  });

  it("locker first, then BLIK: funds go to escrow and a label is created", async () => {
    await selectLocker(db, { orderId, buyerId: buyer, lockerCode: "waw123m" });
    const r = await payWithBlik(db, { orderId, buyerId: buyer, code: "123456" }, p24);
    expect(r.ok).toBe(true);
    expect(r.order).toMatchObject({
      paymentStatus: "escrow_hold",
      shipmentStatus: "label_created",
      inpostLockerCode: "WAW123M",
      inpostTrackingNumber: expect.stringMatching(/^\d{24}$/),
      paymentReference: expect.stringMatching(/^P24-/),
    });
    const kinds = (await listOrderEvents(db, orderId)).map((e) => e.kind);
    expect(kinds).toEqual(["created", "select_locker", "confirm_payment", "hold_in_escrow", "create_label"]);
  });

  it("BLIK first, then locker: the label is created when the locker is picked", async () => {
    const paid = await payWithBlik(db, { orderId, buyerId: buyer, code: "123456" }, p24);
    expect(paid.order).toMatchObject({ paymentStatus: "escrow_hold", shipmentStatus: "awaiting_locker" });
    const withLocker = await selectLocker(db, { orderId, buyerId: buyer, lockerCode: "KRA01N", remember: true });
    expect(withLocker).toMatchObject({ shipmentStatus: "label_created", inpostLockerCode: "KRA01N" });
    const { rows } = await db.query("select default_paczkomat_id from users where id = $1", [buyer]);
    expect(rows[0]).toEqual({ default_paczkomat_id: "KRA01N" });
  });

  it("keeps the order pending when the bank declines, and lets the buyer retry", async () => {
    const declined = await payWithBlik(db, { orderId, buyerId: buyer, code: "000000" }, p24);
    expect(declined).toMatchObject({ ok: false, order: { paymentStatus: "pending_blik" } });
    const expired = await payWithBlik(db, { orderId, buyerId: buyer, code: "111111" }, p24);
    expect(expired).toMatchObject({ ok: false, message: expect.stringMatching(/wygasł/) });
    const ok = await payWithBlik(db, { orderId, buyerId: buyer, code: "654321" }, p24);
    expect(ok).toMatchObject({ ok: true, order: { paymentStatus: "escrow_hold" } });
  });

  it("rejects malformed codes, strangers, and paying twice", async () => {
    await expect(payWithBlik(db, { orderId, buyerId: buyer, code: "12345" }, p24)).rejects.toMatchObject({
      code: "invalid_blik_code",
    });
    await expect(payWithBlik(db, { orderId, buyerId: other, code: "123456" }, p24)).rejects.toMatchObject({
      code: "forbidden",
    });
    await payWithBlik(db, { orderId, buyerId: buyer, code: "123456" }, p24);
    await expect(payWithBlik(db, { orderId, buyerId: buyer, code: "123456" }, p24)).rejects.toMatchObject({
      code: "already_paid",
    });
  });

  it("charges only once when the buyer double-taps Pay", async () => {
    let charges = 0;
    const slowBank: PaymentProvider = {
      async chargeBlik(req) {
        charges++;
        await new Promise((r) => setTimeout(r, 100));
        return p24.chargeBlik(req);
      },
    };
    const results = await Promise.allSettled([
      payWithBlik(db, { orderId, buyerId: buyer, code: "123456" }, slowBank),
      payWithBlik(db, { orderId, buyerId: buyer, code: "123456" }, slowBank),
    ]);
    expect(charges).toBe(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "payment_in_progress" } });
    expect((await getOrder(db, orderId))!.paymentStatus).toBe("escrow_hold");
  });

  it("remembers BLIK for one-click payments on the next order", async () => {
    await expect(payWithBlik(db, { orderId, buyerId: buyer, useAlias: true }, p24)).rejects.toMatchObject({
      code: "no_blik_alias",
    });
    await payWithBlik(db, { orderId, buyerId: buyer, code: "123456", rememberAlias: true }, p24);
    const { rows } = await db.query<{ blik_alias: string }>("select blik_alias from users where id = $1", [buyer]);
    expect(rows[0].blik_alias).toMatch(/^blik_ua_/);
  });

  it("rejects unknown lockers", async () => {
    await expect(selectLocker(db, { orderId, buyerId: buyer, lockerCode: "ZZZ999Z" })).rejects.toMatchObject({
      code: "invalid_locker",
    });
  });
});

describe("escrow", () => {
  beforeEach(async () => {
    await selectLocker(db, { orderId, buyerId: buyer, lockerCode: "WAW01N" });
    await payWithBlik(db, { orderId, buyerId: buyer, code: "123456" }, p24);
  });

  it("holds funds through shipping and releases them only on delivery confirmation", async () => {
    await expect(confirmDelivery(db, { orderId, buyerId: buyer })).rejects.toMatchObject({ code: "invalid_order_transition" });

    await expect(dispatchOrder(db, { orderId, sellerId: buyer })).rejects.toMatchObject({ code: "forbidden" });
    const shipped = await dispatchOrder(db, { orderId, sellerId: seller });
    expect(shipped).toMatchObject({ shipmentStatus: "in_transit", paymentStatus: "escrow_hold" });

    const arrived = await applyInpostStatus(db, { trackingNumber: shipped.inpostTrackingNumber!, status: "ready_to_pickup" });
    expect(arrived).toMatchObject({ shipmentStatus: "ready_for_pickup", paymentStatus: "escrow_hold" });

    await expect(confirmDelivery(db, { orderId, buyerId: other })).rejects.toMatchObject({ code: "forbidden" });
    const done = await confirmDelivery(db, { orderId, buyerId: buyer });
    expect(done).toMatchObject({
      shipmentStatus: "delivered",
      paymentStatus: "released",
      deliveryConfirmedAt: expect.any(String),
    });

    const kinds = (await listOrderEvents(db, orderId)).map((e) => e.kind);
    expect(kinds.slice(-4)).toEqual(["dispatch", "arrive_at_locker", "confirm_delivery", "release_escrow"]);
  });

  it("releases escrow when InPost reports the parcel collected", async () => {
    const shipped = await dispatchOrder(db, { orderId, sellerId: seller });
    const done = await applyInpostStatus(db, { trackingNumber: shipped.inpostTrackingNumber!, status: "delivered" });
    expect(done).toMatchObject({ shipmentStatus: "delivered", paymentStatus: "released" });
  });

  it("the database itself refuses to release escrow without delivery", async () => {
    await expect(db.query("update orders set payment_status = 'released' where id = $1", [orderId])).rejects.toThrow(
      /check constraint/,
    );
  });
});
