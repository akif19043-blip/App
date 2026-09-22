"use client";

import { CheckCircle2, ExternalLink, Loader2, Package, Printer, Truck, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { CheckoutModal } from "@/components/checkout/checkout-modal";
import { PaymentBadge, SHIPMENT_LABELS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/client";
import { formatPLN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Order, User } from "@/types/domain";

type Lists = { purchases: Order[]; sales: Order[] };

const SHIPMENT_STEPS = ["awaiting_locker", "label_created", "in_transit", "ready_for_pickup", "delivered"] as const;

export function OrdersView({ initial, user, demoTools }: { initial: Lists; user: User; demoTools: boolean }) {
  const [lists, setLists] = useState(initial);
  const [tab, setTab] = useState<"purchases" | "sales">(
    initial.purchases.length || !initial.sales.length ? "purchases" : "sales",
  );
  const [checkout, setCheckout] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => setLists(await api<Lists>("/api/orders")), []);

  async function act(key: string, path: string) {
    setBusy(key);
    setError(null);
    try {
      await api(path, { body: {} });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operacja nie powiodła się.");
    } finally {
      setBusy(null);
    }
  }

  const orders = lists[tab];
  const showTabs = user.role !== "buyer" || lists.sales.length > 0;

  return (
    <div className="space-y-4">
      {showTabs && (
        <div className="inline-grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["purchases", "sales"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-4 py-1.5 font-semibold",
                tab === t ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {t === "purchases" ? `Zakupy (${lists.purchases.length})` : `Sprzedaż (${lists.sales.length})`}
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      {orders.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {tab === "purchases" ? "Nie masz jeszcze wygranych licytacji." : "Nic jeszcze nie sprzedałeś."}
        </p>
      )}

      <ul className="space-y-3">
        {orders.map((o) => {
          const stepIdx = SHIPMENT_STEPS.indexOf(o.shipmentStatus);
          const isBuyer = tab === "purchases";
          return (
            <li key={o.id}>
              <Card className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  {o.productImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.productImage} alt="" className="size-14 rounded-lg bg-muted object-cover" />
                  ) : (
                    <div className="grid size-14 place-items-center rounded-lg bg-muted">
                      <Package className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{o.productTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      {isBuyer ? `od @${o.sellerName}` : `dla @${o.buyerName}`} ·{" "}
                      {new Date(o.createdAt).toLocaleDateString("pl-PL")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-bold">{formatPLN(o.finalPrice)}</span>
                      <PaymentBadge status={o.paymentStatus} />
                    </div>
                  </div>
                </div>

                {o.paymentStatus !== "pending_blik" && (
                  <div>
                    <div className="grid grid-cols-5 gap-1" aria-hidden>
                      {SHIPMENT_STEPS.map((s, i) => (
                        <div key={s} className={cn("h-1.5 rounded-full", i <= stepIdx ? "bg-inpost" : "bg-muted")} />
                      ))}
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm">
                      <Truck className="size-4 text-amber-500" />
                      {SHIPMENT_LABELS[o.shipmentStatus]}
                      {o.inpostLockerCode && <span className="text-muted-foreground">· {o.inpostLockerCode}</span>}
                    </p>
                    {o.inpostTrackingNumber && (
                      <a
                        href={`https://inpost.pl/sledzenie-przesylek?number=${o.inpostTrackingNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        {o.inpostTrackingNumber} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {isBuyer && o.paymentStatus === "pending_blik" && (
                    <Button variant="blik" onClick={() => setCheckout(o.id)}>
                      <Wallet /> Zapłać BLIK
                    </Button>
                  )}
                  {isBuyer && o.paymentStatus === "escrow_hold" && o.shipmentStatus === "awaiting_locker" && (
                    <Button variant="inpost" onClick={() => setCheckout(o.id)}>
                      Wybierz Paczkomat
                    </Button>
                  )}
                  {isBuyer && o.shipmentStatus === "ready_for_pickup" && (
                    <Button
                      variant="success"
                      disabled={busy != null}
                      onClick={() => act(`c${o.id}`, `/api/orders/${o.id}/confirm-delivery`)}
                    >
                      {busy === `c${o.id}` ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Potwierdzam odbiór
                    </Button>
                  )}
                  {!isBuyer && o.shipmentStatus === "label_created" && (
                    <>
                      <Button asChild variant="outline">
                        <a href={`/api/orders/${o.id}/label`} target="_blank" rel="noreferrer">
                          <Printer /> Etykieta
                        </a>
                      </Button>
                      <Button disabled={busy != null} onClick={() => act(`d${o.id}`, `/api/orders/${o.id}/dispatch`)}>
                        {busy === `d${o.id}` ? <Loader2 className="animate-spin" /> : <Truck />} Nadałem paczkę
                      </Button>
                    </>
                  )}
                  {demoTools && o.shipmentStatus === "in_transit" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy != null}
                      onClick={() => act(`s${o.id}`, `/api/demo/inpost/${o.id}`)}
                    >
                      {busy === `s${o.id}` && <Loader2 className="animate-spin" />}
                      Demo: dostarcz do Paczkomatu
                    </Button>
                  )}
                </div>
                {!isBuyer && o.paymentStatus === "escrow_hold" && (
                  <p className="text-xs text-muted-foreground">
                    Środki czekają w depozycie — wypłacimy je, gdy kupujący odbierze paczkę.
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <CheckoutModal
        orderId={checkout}
        user={user}
        open={checkout != null}
        onOpenChange={(o) => {
          if (!o) {
            setCheckout(null);
            void reload();
          }
        }}
      />
    </div>
  );
}
