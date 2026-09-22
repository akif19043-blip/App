import { ArrowLeft, Video } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddProductForm } from "@/components/seller/add-product-form";
import { DeleteProductButton, StreamStatusButton } from "@/components/seller/stream-controls";
import { ProductStatusBadge, StreamStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getDb } from "@/lib/db";
import { formatPLN } from "@/lib/money";
import { getStream, listProducts } from "@/lib/streams/service";

export const dynamic = "force-dynamic";

export default async function SellerStreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = await requirePageUser(`/seller/streams/${id}`, "seller");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const stream = await getStream(db, id);
  if (!stream || stream.sellerId !== seller.id) notFound();
  const products = await listProducts(db, id);

  return (
    <div className="space-y-6">
      <Link href="/seller" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Wszystkie transmisje
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StreamStatusBadge status={stream.status} />
            <span className="text-sm text-muted-foreground">{stream.category}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{stream.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StreamStatusButton streamId={stream.id} status={stream.status} />
          {stream.status === "live" && (
            <Button asChild variant="secondary">
              <Link href={`/live/${stream.id}`}>
                <Video /> Otwórz studio
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kolejka przedmiotów</CardTitle>
          <CardDescription>
            W studiu wybierasz przedmiot i wciskasz „Start” — licytacja trwa 30 sekund, a oferta w ostatnich 5 sekundach
            przedłuża ją do 10 sekund.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {products.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {products.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 p-3">
                  <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt="" className="size-12 rounded-md object-cover" />
                  ) : (
                    <div className="size-12 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-sm text-muted-foreground">
                      od {formatPLN(p.startingPrice)}
                      {p.currentHighestBid != null && <> · wylicytowano {formatPLN(p.currentHighestBid)}</>}
                    </p>
                  </div>
                  <ProductStatusBadge status={p.status} />
                  {p.status === "draft" && <DeleteProductButton productId={p.id} />}
                </li>
              ))}
            </ul>
          )}
          {stream.status !== "ended" && <AddProductForm streamId={stream.id} />}
        </CardContent>
      </Card>
    </div>
  );
}
