import { BadgeCheck, Gavel, Package, Smartphone } from "lucide-react";
import { StreamCard } from "@/components/stream-card";
import { getDb } from "@/lib/db";
import { listStreams } from "@/lib/streams/service";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Gavel, text: "30 s na licytację" },
  { icon: Smartphone, text: "BLIK jednym kliknięciem" },
  { icon: Package, text: "Paczkomaty InPost" },
  { icon: BadgeCheck, text: "Ochrona kupującego" },
];

export default async function HomePage() {
  const streams = await listStreams(await getDb(), { status: ["live", "upcoming"] });
  const live = streams.filter((s) => s.status === "live");
  const upcoming = streams.filter((s) => s.status === "upcoming");

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-gradient-to-br from-primary to-rose-400 p-6 text-primary-foreground sm:p-10">
        <h1 className="max-w-xl text-3xl font-extrabold leading-tight sm:text-4xl">
          Licytuj na żywo. Płać BLIKIEM. Odbierz w Paczkomacie.
        </h1>
        <p className="mt-3 max-w-lg text-primary-foreground/85">
          Sprzedawcy pokazują przedmioty na wideo, a Ty przebijasz jednym kliknięciem. Pieniądze czekają bezpiecznie,
          dopóki nie odbierzesz paczki.
        </p>
        <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-4">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 font-medium">
              <Icon className="size-4" /> {text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Na żywo teraz</h2>
        {live.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {live.map((s) => (
              <StreamCard key={s.id} stream={s} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Nikt teraz nie nadaje. Zajrzyj za chwilę!
          </p>
        )}
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Wkrótce</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {upcoming.map((s) => (
              <StreamCard key={s.id} stream={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
