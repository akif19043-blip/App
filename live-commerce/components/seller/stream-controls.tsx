"use client";

import { Loader2, Radio, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client";
import type { StreamStatus } from "@/types/domain";

export function StreamStatusButton({ streamId, status }: { streamId: string; status: StreamStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === "ended") return null;
  const next = status === "upcoming" ? "live" : "ended";

  return (
    <div className="space-y-1">
      <Button
        variant={next === "live" ? "default" : "outline"}
        disabled={pending}
        onClick={async () => {
          if (next === "ended" && !confirm("Zakończyć transmisję? Nie będzie można jej wznowić.")) return;
          setPending(true);
          setError(null);
          try {
            await api(`/api/streams/${streamId}`, { method: "PATCH", body: { status: next } });
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Błąd.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : next === "live" ? <Radio /> : <Square />}
        {next === "live" ? "Rozpocznij transmisję" : "Zakończ transmisję"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function DeleteProductButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Usuń przedmiot"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api(`/api/products/${productId}`, { method: "DELETE" });
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <Trash2 className="text-muted-foreground" />
    </Button>
  );
}
