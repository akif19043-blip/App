import { uuid } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getOrder } from "@/lib/orders/service";
import { findPaczkomat } from "@/lib/shipping/lockers";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Printable A6 InPost label (stand-in for the ShipX label PDF). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const id = uuid.safeParse((await params).id);
  if (!user || !id.success) return new Response("Not found", { status: 404 });
  const order = await getOrder(await getDb(), id.data);
  if (!order || order.sellerId !== user.id || !order.inpostTrackingNumber || !order.inpostLockerCode) {
    return new Response("Not found", { status: 404 });
  }
  const locker = findPaczkomat(order.inpostLockerCode);
  // Decorative barcode: one bar per digit, width from the digit.
  const bars = [...order.inpostTrackingNumber]
    .map((d, i) => `<rect x="${i * 12}" y="0" width="${1 + (Number(d) % 4) * 2}" height="60"/>`)
    .join("");

  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Etykieta ${esc(order.inpostTrackingNumber)}</title>
<style>
  @page { size: A6; margin: 6mm }
  body { font: 14px/1.4 system-ui, sans-serif; max-width: 105mm; margin: 0 auto; padding: 12px; color: #111 }
  .box { border: 2px solid #111; border-radius: 6px; padding: 10px; margin-bottom: 8px }
  .brand { background: #ffcd00; font-weight: 800; padding: 6px 10px; border-radius: 6px; display: inline-block }
  .big { font-size: 28px; font-weight: 800; letter-spacing: 1px }
  .muted { color: #555; font-size: 12px }
  svg { width: 100%; height: 60px }
</style></head><body onload="window.print()">
  <div class="brand">InPost Paczkomat® · gabaryt A</div>
  <div class="box"><div class="muted">Paczkomat odbiorcy</div><div class="big">${esc(order.inpostLockerCode)}</div>
    <div>${esc(locker ? `${locker.street}, ${locker.postalCode} ${locker.city}` : "")}</div></div>
  <div class="box"><div class="muted">Odbiorca</div><div>${esc(order.buyerName)}</div>
    <div class="muted" style="margin-top:6px">Nadawca</div><div>${esc(order.sellerName)}</div></div>
  <div class="box"><svg viewBox="0 0 288 60" preserveAspectRatio="none">${bars}</svg>
    <div style="text-align:center;font-family:monospace;font-size:15px">${esc(order.inpostTrackingNumber)}</div></div>
  <div class="muted">Zamówienie ${esc(order.id.slice(0, 8))} · ${esc(order.productTitle)}</div>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
