import { randomInt } from "node:crypto";
import { findPaczkomat } from "./lockers";

// InPost ShipX stand-in. In production `createShipment` would POST to
// /v1/organizations/{id}/shipments with service "inpost_locker_standard" and
// target_point = locker id, then fetch the label PDF. Here we generate the
// same data locally so the rest of the flow is identical.

export interface Shipment {
  trackingNumber: string;
  lockerCode: string;
  parcelSize: "A" | "B" | "C";
}

/** InPost tracking numbers are 24 digits. */
export function generateTrackingNumber(): string {
  let digits = "6"; // locker parcels start with 6
  while (digits.length < 24) digits += randomInt(0, 10).toString();
  return digits;
}

export function createShipment(lockerCode: string, parcelSize: Shipment["parcelSize"] = "A"): Shipment {
  if (!findPaczkomat(lockerCode)) throw new Error(`Unknown Paczkomat ${lockerCode}`);
  return { trackingNumber: generateTrackingNumber(), lockerCode, parcelSize };
}

export function trackingUrl(trackingNumber: string) {
  return `https://inpost.pl/sledzenie-przesylek?number=${trackingNumber}`;
}
