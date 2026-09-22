"use client";

import { Loader2, MapPin, Zap } from "lucide-react";
import { useState } from "react";
import { PaczkomatPicker } from "@/components/checkout/paczkomat-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client";
import type { User } from "@/types/domain";

export function AccountSettings({ initial }: { initial: User }) {
  const [user, setUser] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [locker, setLocker] = useState(initial.defaultPaczkomatId);
  const [busy, setBusy] = useState(false);

  async function save(body: object) {
    setBusy(true);
    try {
      const res = await api<{ user: User }>("/api/me", { method: "PATCH", body });
      setUser(res.user);
      setPicking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-amber-500" /> Domyślny Paczkomat
          </CardTitle>
          <CardDescription>Podpowiemy go przy każdej wygranej licytacji.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-black">{user.defaultPaczkomatId ?? "—"}</p>
          {picking ? (
            <>
              <PaczkomatPicker selected={locker} onSelect={setLocker} />
              <Button variant="inpost" disabled={!locker || busy} onClick={() => save({ defaultPaczkomatId: locker })}>
                {busy && <Loader2 className="animate-spin" />} Zapisz
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setPicking(true)}>
              Zmień Paczkomat
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-5" /> BLIK jednym kliknięciem
          </CardTitle>
          <CardDescription>Zapisany BLIK pozwala płacić bez przepisywania kodu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-semibold">{user.blikAlias ? "Aktywny" : "Nieaktywny — włączysz go przy najbliższej płatności kodem."}</p>
          {user.blikAlias && (
            <Button variant="outline" disabled={busy} onClick={() => save({ forgetBlik: true })}>
              Usuń zapisany BLIK
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
