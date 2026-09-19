import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEFAULT_GAME_CONFIG, SECTOR_ZERO, WEAPON_DEFINITIONS } from '@deadline/shared';
import { getSessionUser } from '@/lib/session';

const FEATURES = [
  {
    title: 'Authoritative raids',
    body: 'Movement, fire rate, damage and loot are all decided by the server. The client only ever asks.',
  },
  {
    title: 'Everything you carry is at risk',
    body: 'Die and your bag stays on your body for whoever finds it. Only the secure container comes home.',
  },
  {
    title: 'Ten minutes on the clock',
    body: 'The last two are the danger phase. If you are not out when it hits zero, you are MIA.',
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect('/menu');

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="dl-heading text-2xl font-bold">
          DEAD<span className="text-signal">LINE</span>
        </span>
        <Link
          href="/login"
          className="dl-heading border border-edge px-4 py-2 text-sm text-muted transition-colors hover:border-signal hover:text-ink"
        >
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-4 text-xs tracking-[0.5em] text-signal">QUARANTINE ZONE — SECTOR ZERO</p>
        <h1 className="dl-heading max-w-3xl text-6xl leading-[0.95] font-bold sm:text-8xl">
          Loot.
          <br />
          Survive.
          <br />
          <span className="text-signal">Get out.</span>
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted">
          A browser-based multiplayer extraction shooter. Drop into an abandoned European
          industrial quarter with whatever you can afford to lose, fill your bag from the
          buildings and the bodies, and reach an exit before the deadline. Everything you fail to
          extract is gone.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="dl-heading dl-glow-signal bg-signal px-8 py-3 text-lg font-semibold text-void transition-transform hover:-translate-y-0.5"
          >
            Deploy now
          </Link>
          <Link
            href="/login"
            className="dl-heading border border-edge px-8 py-3 text-lg text-muted transition-colors hover:border-ink hover:text-ink"
          >
            Guest access
          </Link>
        </div>

        <dl className="mt-16 grid gap-6 border-t border-edge pt-8 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <dt className="dl-heading mb-2 text-sm text-ink">{feature.title}</dt>
              <dd className="text-xs leading-relaxed text-muted">{feature.body}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="grid gap-4 border-t border-edge py-6 text-[11px] tracking-[0.2em] text-muted sm:grid-cols-4">
        <span>{DEFAULT_GAME_CONFIG.maxPlayers} OPERATORS</span>
        <span>{SECTOR_ZERO.pois.length} DISTRICTS</span>
        <span>{WEAPON_DEFINITIONS.length} WEAPONS</span>
        <span>{DEFAULT_GAME_CONFIG.matchDurationSeconds / 60} MINUTE RAIDS</span>
      </footer>
    </div>
  );
}
