import Link from 'next/link';
import { formatCredits } from '@deadline/ui';
import type { OperatorOverview } from '@/lib/queries';

/**
 * Menu chrome shared by every out-of-raid screen: the wordmark, the operator
 * strip and the navigation rail.
 */
const NAV = [
  { href: '/menu', label: 'Deploy' },
  { href: '/loadout', label: 'Loadout' },
  { href: '/stash', label: 'Stash' },
  { href: '/market', label: 'Market' },
  { href: '/missions', label: 'Missions' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/settings', label: 'Settings' },
] as const;

export function Shell({
  operator,
  active,
  children,
}: {
  operator: OperatorOverview;
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-5 py-6 lg:px-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-edge pb-5">
        <Link href="/menu" className="group flex items-baseline gap-3">
          <span className="dl-heading text-3xl font-bold text-ink transition-colors group-hover:text-signal">
            DEAD<span className="text-signal">LINE</span>
          </span>
          <span className="hidden text-[11px] tracking-[0.35em] text-muted sm:inline">
            LOOT · SURVIVE · GET OUT
          </span>
        </Link>

        <div className="flex items-center gap-5 text-right">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-muted">CREDITS</div>
            <div className="dl-heading text-xl text-caution">
              {formatCredits(operator.profile.credits)}
            </div>
          </div>
          <div className="h-8 w-px bg-edge" />
          <div>
            <div className="text-[10px] tracking-[0.3em] text-muted">
              LEVEL {operator.profile.level}
            </div>
            <div className="dl-heading text-xl">{operator.profile.username}</div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-8 lg:flex-row">
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-48 lg:flex-col">
          {NAV.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'dl-heading border-l-2 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'border-signal bg-raised text-ink'
                    : 'border-transparent text-muted hover:border-edge hover:text-ink',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 pb-10">{children}</main>
      </div>
    </div>
  );
}

export function XpBar({ operator }: { operator: OperatorOverview }) {
  const { progress } = operator;
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-[10px] tracking-[0.25em] text-muted">
        <span>LEVEL {progress.level}</span>
        <span>
          {progress.xpIntoLevel.toLocaleString()} / {(progress.nextLevelXp - progress.currentLevelXp).toLocaleString()} XP
        </span>
      </div>
      <div className="h-1.5 w-full bg-edge">
        <div
          className="h-full bg-signal transition-[width] duration-500"
          style={{ width: `${Math.round(progress.progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
