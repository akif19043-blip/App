import type { PaymentStatus, ShipmentStatus } from "@/types/domain";

// An order moves along two tracks: money (payment_status) and parcel
// (shipment_status). Money is held in escrow until the buyer's delivery is
// confirmed; only then may it be released to the seller.
//
//   payment:  pending_blik → paid → escrow_hold → released
//   shipment: awaiting_locker → label_created → in_transit → ready_for_pickup → delivered

export interface OrderState {
  paymentStatus: PaymentStatus;
  shipmentStatus: ShipmentStatus;
  inpostLockerCode: string | null;
}

export type OrderAction =
  | "confirm_payment" // BLIK authorised by the bank
  | "hold_in_escrow" // platform takes custody of the funds
  | "select_locker" // buyer picks a Paczkomat
  | "create_label" // InPost shipment created
  | "dispatch" // seller hands the parcel to InPost
  | "arrive_at_locker" // InPost: parcel waiting in the locker
  | "confirm_delivery" // buyer collected it / InPost reports delivered
  | "release_escrow"; // funds paid out to the seller

const PAYMENT_NEXT: Partial<Record<OrderAction, [from: PaymentStatus, to: PaymentStatus]>> = {
  confirm_payment: ["pending_blik", "paid"],
  hold_in_escrow: ["paid", "escrow_hold"],
  release_escrow: ["escrow_hold", "released"],
};

const SHIPMENT_NEXT: Partial<Record<OrderAction, [from: ShipmentStatus, to: ShipmentStatus]>> = {
  create_label: ["awaiting_locker", "label_created"],
  dispatch: ["label_created", "in_transit"],
  arrive_at_locker: ["in_transit", "ready_for_pickup"],
  confirm_delivery: ["ready_for_pickup", "delivered"],
};

const FUNDS_SECURED: PaymentStatus[] = ["escrow_hold", "released"];

export class InvalidTransitionError extends Error {
  constructor(
    readonly action: OrderAction,
    readonly state: OrderState,
    reason: string,
  ) {
    super(`Cannot ${action}: ${reason}`);
    this.name = "InvalidTransitionError";
  }
}

/** Why `action` is not allowed in `state`, or null if it is. */
export function transitionBlocker(state: OrderState, action: OrderAction): string | null {
  const pay = PAYMENT_NEXT[action];
  if (pay && state.paymentStatus !== pay[0]) {
    return `payment is ${state.paymentStatus}, expected ${pay[0]}`;
  }
  const ship = SHIPMENT_NEXT[action];
  if (ship && state.shipmentStatus !== ship[0]) {
    return `shipment is ${state.shipmentStatus}, expected ${ship[0]}`;
  }

  switch (action) {
    case "select_locker":
      // The locker can change until a label has been printed for it.
      if (state.shipmentStatus !== "awaiting_locker") return "a shipping label already exists";
      return null;
    case "create_label":
      if (!state.inpostLockerCode) return "no Paczkomat selected";
      if (!FUNDS_SECURED.includes(state.paymentStatus)) return "order is not paid";
      return null;
    case "release_escrow":
      if (state.shipmentStatus !== "delivered") return "delivery has not been confirmed";
      return null;
    default:
      return null;
  }
}

export function canTransition(state: OrderState, action: OrderAction): boolean {
  return transitionBlocker(state, action) === null;
}

/** Apply `action` to `state`, or throw InvalidTransitionError. */
export function transition(state: OrderState, action: OrderAction, lockerCode?: string): OrderState {
  const blocker = transitionBlocker(state, action);
  if (blocker) throw new InvalidTransitionError(action, state, blocker);

  const next = { ...state };
  const pay = PAYMENT_NEXT[action];
  if (pay) next.paymentStatus = pay[1];
  const ship = SHIPMENT_NEXT[action];
  if (ship) next.shipmentStatus = ship[1];
  if (action === "select_locker") {
    if (!lockerCode) throw new InvalidTransitionError(action, state, "locker code missing");
    next.inpostLockerCode = lockerCode;
  }
  return next;
}
