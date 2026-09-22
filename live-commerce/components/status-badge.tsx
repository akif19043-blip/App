import { Badge } from "@/components/ui/badge";
import type { PaymentStatus, ProductStatus, ShipmentStatus, StreamStatus } from "@/types/domain";

export function StreamStatusBadge({ status }: { status: StreamStatus }) {
  if (status === "live") return <Badge variant="live">Na żywo</Badge>;
  if (status === "upcoming") return <Badge variant="secondary">Zaplanowana</Badge>;
  return <Badge variant="outline">Zakończona</Badge>;
}

const PRODUCT: Record<ProductStatus, [string, "secondary" | "warning" | "success" | "outline"]> = {
  draft: ["W kolejce", "secondary"],
  bidding_active: ["Licytacja trwa", "warning"],
  sold: ["Sprzedany", "success"],
  unsold: ["Bez ofert", "outline"],
};
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const [label, variant] = PRODUCT[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending_blik: "Czeka na BLIK",
  paid: "Opłacone",
  escrow_hold: "Środki w depozycie",
  released: "Wypłacone sprzedawcy",
};

export const SHIPMENT_LABELS: Record<ShipmentStatus, string> = {
  awaiting_locker: "Wybierz Paczkomat",
  label_created: "Etykieta gotowa — czeka na nadanie",
  in_transit: "W drodze",
  ready_for_pickup: "Czeka w Paczkomacie",
  delivered: "Odebrana",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const variant = status === "pending_blik" ? "warning" : status === "released" ? "success" : "secondary";
  return <Badge variant={variant}>{PAYMENT_LABELS[status]}</Badge>;
}
