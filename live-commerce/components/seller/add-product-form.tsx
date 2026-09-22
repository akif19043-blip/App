"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/client";
import { parsePLN } from "@/lib/money";

export function AddProductForm({ streamId }: { streamId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      ref={formRef}
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const startingPrice = parsePLN(String(f.get("price") ?? ""));
        if (startingPrice == null) {
          setError("Podaj cenę w złotych, np. 49 lub 49,99.");
          return;
        }
        setPending(true);
        setError(null);
        try {
          await api(`/api/streams/${streamId}/products`, {
            body: {
              title: f.get("title"),
              description: f.get("description") ?? "",
              startingPrice,
              imageUrl: f.get("imageUrl") ?? "",
            },
          });
          formRef.current?.reset();
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Nie udało się dodać przedmiotu.");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="p-title">Nazwa przedmiotu</Label>
        <Input id="p-title" name="title" required minLength={2} maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-price">Cena wywoławcza (zł)</Label>
        <Input id="p-price" name="price" required inputMode="decimal" placeholder="50" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-image">Zdjęcie (URL, opcjonalnie)</Label>
        <Input id="p-image" name="imageUrl" type="text" placeholder="https://…" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="p-desc">Opis</Label>
        <Textarea id="p-desc" name="description" maxLength={2000} rows={2} placeholder="Stan, zawartość zestawu, wady…" />
      </div>
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <Button type="submit" disabled={pending} className="sm:col-span-2 sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" /> : <Plus />} Dodaj do kolejki
      </Button>
    </form>
  );
}
