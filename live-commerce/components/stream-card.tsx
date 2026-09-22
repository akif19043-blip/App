import { Eye, Radio } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Stream } from "@/types/domain";

const GRADIENTS = [
  "from-rose-500 to-orange-400",
  "from-violet-600 to-fuchsia-500",
  "from-sky-600 to-cyan-400",
  "from-emerald-600 to-lime-400",
  "from-amber-500 to-red-500",
];

function gradientFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function StreamCard({ stream }: { stream: Stream }) {
  return (
    <Link
      href={`/live/${stream.id}`}
      className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`relative aspect-[4/5] bg-gradient-to-br ${gradientFor(stream.id)} p-3`}>
        <div className="flex items-start justify-between">
          {stream.status === "live" ? (
            <Badge variant="live">
              <Radio /> Na żywo
            </Badge>
          ) : (
            <Badge variant="glass">Wkrótce</Badge>
          )}
          {stream.status === "live" && (
            <Badge variant="glass">
              <Eye /> {stream.viewerCount}
            </Badge>
          )}
        </div>
        <p className="absolute inset-x-3 bottom-3 line-clamp-3 text-lg font-extrabold leading-tight text-white drop-shadow">
          {stream.title}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 p-3 text-sm">
        <span className="truncate font-semibold">@{stream.sellerName}</span>
        <span className="shrink-0 text-muted-foreground">{stream.category}</span>
      </div>
    </Link>
  );
}
