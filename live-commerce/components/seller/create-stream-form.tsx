"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api, ApiError } from "@/lib/client";
import type { Stream } from "@/types/domain";

const CATEGORIES = ["Gry retro", "Karty kolekcjonerskie", "Obuwie", "Moda vintage", "Elektronika", "Figurki", "Inne"];

export function CreateStreamForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setPending(true);
        setError(null);
        try {
          const { stream } = await api<{ stream: Stream }>("/api/streams", {
            body: { title: f.get("title"), category: f.get("category") },
          });
          router.push(`/seller/streams/${stream.id}`);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Nie udało się utworzyć transmisji.");
          setPending(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="title">Tytuł transmisji</Label>
        <Input id="title" name="title" required minLength={3} maxLength={120} placeholder="np. Pokémon TCG — otwieramy boostery" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Kategoria</Label>
        <select
          id="category"
          name="category"
          className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs"
          defaultValue={CATEGORIES[0]}
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />} Utwórz
      </Button>
      {error && <p className="text-sm text-destructive sm:col-span-3">{error}</p>}
    </form>
  );
}
