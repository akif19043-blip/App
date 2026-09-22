import { describe, expect, it } from "vitest";
import {
  canTransition,
  InvalidTransitionError,
  transition,
  type OrderAction,
  type OrderState,
} from "@/lib/orders/state-machine";

const fresh: OrderState = { paymentStatus: "pending_blik", shipmentStatus: "awaiting_locker", inpostLockerCode: null };

function run(state: OrderState, steps: [OrderAction, string?][]) {
  return steps.reduce((s, [action, locker]) => transition(s, action, locker), state);
}

describe("order state machine", () => {
  it("walks the happy path: pay, escrow, label, ship, deliver, release", () => {
    const end = run(fresh, [
      ["select_locker", "WAW123M"],
      ["confirm_payment"],
      ["hold_in_escrow"],
      ["create_label"],
      ["dispatch"],
      ["arrive_at_locker"],
      ["confirm_delivery"],
      ["release_escrow"],
    ]);
    expect(end).toEqual({ paymentStatus: "released", shipmentStatus: "delivered", inpostLockerCode: "WAW123M" });
  });

  it("allows choosing the locker after paying", () => {
    const paid = run(fresh, [["confirm_payment"], ["hold_in_escrow"]]);
    expect(canTransition(paid, "create_label")).toBe(false);
    const labelled = run(paid, [["select_locker", "KRA01N"], ["create_label"]]);
    expect(labelled.shipmentStatus).toBe("label_created");
  });

  it("does not mutate the input state", () => {
    const copy = { ...fresh };
    transition(fresh, "confirm_payment");
    expect(fresh).toEqual(copy);
  });

  it.each<[string, OrderState, OrderAction]>([
    ["escrow before payment", fresh, "hold_in_escrow"],
    ["paying twice", { ...fresh, paymentStatus: "paid" }, "confirm_payment"],
    ["label before payment", { ...fresh, inpostLockerCode: "WAW123M" }, "create_label"],
    ["label without locker", { ...fresh, paymentStatus: "escrow_hold" }, "create_label"],
    ["shipping before label", { ...fresh, paymentStatus: "escrow_hold", inpostLockerCode: "WAW123M" }, "dispatch"],
    [
      "releasing escrow before delivery",
      { paymentStatus: "escrow_hold", shipmentStatus: "ready_for_pickup", inpostLockerCode: "WAW123M" },
      "release_escrow",
    ],
    [
      "releasing unpaid money",
      { paymentStatus: "pending_blik", shipmentStatus: "delivered", inpostLockerCode: "WAW123M" },
      "release_escrow",
    ],
    [
      "changing locker after the label is printed",
      { paymentStatus: "escrow_hold", shipmentStatus: "label_created", inpostLockerCode: "WAW123M" },
      "select_locker",
    ],
    [
      "confirming delivery of a parcel still in transit",
      { paymentStatus: "escrow_hold", shipmentStatus: "in_transit", inpostLockerCode: "WAW123M" },
      "confirm_delivery",
    ],
    [
      "releasing twice",
      { paymentStatus: "released", shipmentStatus: "delivered", inpostLockerCode: "WAW123M" },
      "release_escrow",
    ],
  ])("rejects %s", (_, state, action) => {
    expect(canTransition(state, action)).toBe(false);
    expect(() => transition(state, action, "WAW01N")).toThrow(InvalidTransitionError);
  });

  it("requires a locker code to select a locker", () => {
    expect(() => transition(fresh, "select_locker")).toThrow(/locker code missing/);
  });
});
