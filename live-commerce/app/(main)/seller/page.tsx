import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateStreamForm } from "@/components/seller/create-stream-form";
import { StreamStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getDb } from "@/lib/db";
import { listStreams } from "@/lib/streams/service";

export const metadata: Metadata = { title: "Panel sprzedawcy" };
export const dynamic = "force-dynamic";

export default async function SellerDashboard() {
  const seller = await requirePageUser("/seller", "seller");
  const streams = await listStreams(await getDb(), { sellerId: seller.id });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel sprzedawcy</h1>
        <p className="text-muted-foreground">Zaplanuj transmisję, dodaj przedmioty do kolejki i licytuj na żywo.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nowa transmisja</CardTitle>
          <CardDescription>Po utworzeniu dodasz przedmioty i wystartujesz, kiedy zechcesz.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateStreamForm />
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Twoje transmisje</h2>
        {streams.length === 0 && <p className="text-muted-foreground">Nie masz jeszcze żadnych transmisji.</p>}
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {streams.map((s) => (
            <li key={s.id}>
              <Link href={`/seller/streams/${s.id}`} className="flex items-center gap-3 p-4 hover:bg-accent/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.category} · {new Date(s.createdAt).toLocaleDateString("pl-PL")}
                  </p>
                </div>
                <StreamStatusBadge status={s.status} />
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
