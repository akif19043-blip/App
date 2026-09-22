"use client";

import { CheckCircle2, Loader2, MapPin, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/client";
import { formatPLN } from "@/lib/money";
import { findPaczkomat } from "@/lib/shipping/lockers";
import type { Order, User } from "@/types/domain";
import { PaczkomatPicker } from "./paczkomat-picker";

type Step = "loading" | "locker" | "blik" | "confirming" | "done";

/**
 * Post-auction checkout, the Polish way: pick a Paczkomat, pay with BLIK.
 * The money lands in escrow and the InPost label is generated automatically.
 */
export function CheckoutModal({
  orderId,
  user,
  open,
  onOpenChange,
  onPaid,
}: {
  orderId: string | null;
  user: Pick<User, "blikAlias" | "defaultPaczkomatId">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid?: (order: Order) => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [locker, setLocker] = useState<string | null>(user.defaultPaczkomatId);
  const [rememberLocker, setRememberLocker] = useState(!user.defaultPaczkomatId);
  const [pickingLocker, setPickingLocker] = useState(!user.defaultPaczkomatId);
  const [hasAlias, setHasAlias] = useState(!!user.blikAlias);
  const [code, setCode] = useState("");
  const [rememberBlik, setRememberBlik] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stepFor = useCallback((o: Order): Step => {
    if (o.paymentStatus !== "pending_blik") return "done";
    return o.inpostLockerCode ? "blik" : "locker";
  }, []);

  useEffect(() => {
    if (!open || !orderId) return;
    setStep("loading");
    setError(null);
    setCode("");
    api<{ order: Order }>(`/api/orders/${orderId}`)
      .then(({ order }) => {
        setOrder(order);
        if (order.inpostLockerCode) setLocker(order.inpostLockerCode);
        setStep(stepFor(order));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Nie udało się wczytać zamówienia."));
  }, [open, orderId, stepFor]);

  async function confirmLocker() {
    if (!orderId || !locker) return;
    setBusy(true);
    setError(null);
    try {
      const { order } = await api<{ order: Order }>(`/api/orders/${orderId}/locker`, {
        body: { lockerCode: locker, remember: rememberLocker },
      });
      setOrder(order);
      setStep(stepFor(order));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nie udało się zapisać Paczkomatu.");
    } finally {
      setBusy(false);
    }
  }

  async function pay(useAlias: boolean) {
    if (!orderId) return;
    setError(null);
    setStep("confirming");
    try {
      const res = await api<{ ok: boolean; message?: string; order: Order }>(`/api/orders/${orderId}/blik`, {
        body: useAlias ? { useAlias: true } : { code, rememberAlias: rememberBlik },
        okStatuses: [402],
      });
      setOrder(res.order);
      if (res.ok) {
        if (rememberBlik) setHasAlias(true);
        setStep("done");
        onPaid?.(res.order);
      } else {
        setError(res.message ?? "Płatność odrzucona.");
        setCode("");
        setStep("blik");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Płatność nie powiodła się.");
      setCode("");
      setStep("blik");
    }
  }

  const lockerInfo = locker ? findPaczkomat(locker) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose={step === "confirming"} onInteractOutside={(e) => step === "confirming" && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {step === "done" ? "Opłacone!" : step === "locker" ? "Dostawa do Paczkomatu" : "Płatność BLIK"}
          </DialogTitle>
          <DialogDescription>
            {order ? (
              <>
                {order.productTitle} · <span className="font-semibold text-foreground">{formatPLN(order.finalPrice)}</span>
              </>
            ) : (
              "Wczytywanie zamówienia…"
            )}
          </DialogDescription>
        </DialogHeader>

        <StepDots step={step} />

        {step === "loading" && !error && (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "locker" && (
          <div className="space-y-4">
            {!pickingLocker && lockerInfo ? (
              <div className="flex items-start gap-3 rounded-xl border-2 border-inpost bg-inpost/10 p-3">
                <MapPin className="mt-0.5 size-5 text-amber-500" />
                <div className="flex-1">
                  <p className="font-bold">{lockerInfo.id}</p>
                  <p className="text-sm">
                    {lockerInfo.street}, {lockerInfo.city}
                  </p>
                  <p className="text-xs text-muted-foreground">Twój domyślny Paczkomat</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPickingLocker(true)}>
                  Zmień
                </Button>
              </div>
            ) : (
              <PaczkomatPicker selected={locker} onSelect={setLocker} />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rememberLocker} onChange={(e) => setRememberLocker(e.target.checked)} className="size-4 accent-primary" />
              Zapamiętaj jako domyślny Paczkomat
            </label>
            <Button variant="inpost" size="lg" className="w-full" disabled={!locker || busy} onClick={confirmLocker}>
              {busy && <Loader2 className="animate-spin" />}
              {locker ? `Dostawa do ${locker}` : "Wybierz Paczkomat"}
            </Button>
          </div>
        )}

        {step === "blik" && (
          <div className="space-y-4">
            {order?.inpostLockerCode && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4 text-amber-500" /> Dostawa: Paczkomat{" "}
                <span className="font-semibold text-foreground">{order.inpostLockerCode}</span>
              </p>
            )}
            {hasAlias && (
              <>
                <Button variant="blik" size="xl" className="w-full" onClick={() => pay(true)}>
                  <Zap /> Zapłać jednym kliknięciem · {order && formatPLN(order.finalPrice)}
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> lub kodem <div className="h-px flex-1 bg-border" />
                </div>
              </>
            )}
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === 6) void pay(false);
              }}
            >
              <BlikCodeInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setError(null);
                }}
                autoFocus={!hasAlias}
              />
              <p className="text-center text-xs text-muted-foreground">Wpisz 6-cyfrowy kod z aplikacji swojego banku.</p>
              {!hasAlias && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={rememberBlik} onChange={(e) => setRememberBlik(e.target.checked)} className="size-4 accent-primary" />
                  Zapamiętaj BLIK — następnym razem zapłacę bez kodu
                </label>
              )}
              <Button type="submit" variant={hasAlias ? "outline" : "blik"} size="lg" className="w-full" disabled={code.length !== 6}>
                Zapłać {order && formatPLN(order.finalPrice)}
              </Button>
            </form>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" /> Środki trafią do depozytu i zostaną wypłacone po odbiorze paczki.
            </p>
          </div>
        )}

        {step === "confirming" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="relative">
              <Smartphone className="size-12" />
              <Loader2 className="absolute -right-3 -top-3 size-6 animate-spin text-primary" />
            </div>
            <p className="font-semibold">Potwierdź płatność w aplikacji banku</p>
            <p className="text-sm text-muted-foreground">Czekamy na potwierdzenie BLIK…</p>
          </div>
        )}

        {step === "done" && order && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="size-14 text-success" />
              <p className="font-semibold">Płatność przyjęta</p>
              <p className="text-sm text-muted-foreground">
                {formatPLN(order.finalPrice)} czeka bezpiecznie w depozycie do czasu odbioru paczki.
              </p>
            </div>
            {order.inpostTrackingNumber ? (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="text-muted-foreground">Numer przesyłki InPost</p>
                <p className="font-mono font-semibold">{order.inpostTrackingNumber}</p>
                <p className="mt-1 text-muted-foreground">Paczkomat {order.inpostLockerCode}</p>
              </div>
            ) : null}
            <Button className="w-full" variant="secondary" onClick={() => onOpenChange(false)}>
              Wróć do transmisji
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepDots({ step }: { step: Step }) {
  const idx = step === "locker" || step === "loading" ? 0 : step === "done" ? 2 : 1;
  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label="Postęp">
      {["Paczkomat", "BLIK", "Gotowe"].map((label, i) => (
        <li key={label} className="space-y-1">
          <div className={`h-1 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />
          <p className={`text-[11px] ${i <= idx ? "font-semibold" : "text-muted-foreground"}`}>{label}</p>
        </li>
      ))}
    </ol>
  );
}

/** Six boxes that behave like one numeric field (paste works too). */
function BlikCodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative mx-auto w-fit" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        aria-label="Kod BLIK"
        className="absolute inset-0 opacity-0"
        maxLength={6}
      />
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`grid h-14 w-11 place-items-center rounded-lg border-2 font-mono text-2xl font-bold ${
              i === value.length ? "border-primary" : "border-input"
            } ${i === 2 ? "mr-2" : ""}`}
          >
            {value[i] ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}
