import { redirect } from 'next/navigation';
import { INVENTORY, getItem } from '@deadline/shared';
import { formatCredits, rarityColor } from '@deadline/ui';
import { Empty, Panel, Stat } from '@/components/Panel';
import { Shell } from '@/components/Shell';
import { loadOperator, loadStash } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';
import { StashActions } from './StashActions';

export default async function StashPage() {
  if (!(await getSessionUser())) redirect('/login');
  const [operator, stash] = await Promise.all([loadOperator(), loadStash('stash')]);

  const byRarity = new Map<string, number>();
  for (const row of stash.rows) {
    byRarity.set(row.rarity, (byRarity.get(row.rarity) ?? 0) + row.quantity);
  }

  return (
    <Shell operator={operator} active="/stash">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="dl-heading text-3xl font-bold">Stash</h1>
        <div className="flex gap-8">
          <Stat label="TOTAL VALUE" value={`${formatCredits(stash.totalValue)} cr`} tone="text-caution" />
          <Stat
            label="STACKS"
            value={`${stash.rows.length} / ${INVENTORY.stashWidth * INVENTORY.stashHeight}`}
          />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {[...byRarity.entries()].map(([rarity, count]) => (
          <span
            key={rarity}
            className="border px-3 py-1 text-[10px] tracking-[0.25em]"
            style={{ borderColor: rarityColor(rarity), color: rarityColor(rarity) }}
          >
            {rarity.toUpperCase()} ×{count}
          </span>
        ))}
      </div>

      <Panel title="CONTENTS">
        {stash.rows.length === 0 ? (
          <Empty>
            Nothing here yet. Everything you extract lands in this stash — and only what you
            extract.
          </Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {stash.rows.map((row) => {
              const definition = getItem(row.itemId);
              return (
                <article
                  key={row.id}
                  className="border-l-2 border border-edge bg-void/40 px-3 py-2.5"
                  style={{ borderLeftColor: rarityColor(row.rarity) }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="dl-heading text-sm">{row.name}</h3>
                    {row.quantity > 1 && (
                      <span className="font-mono text-xs text-muted">×{row.quantity}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] tracking-[0.2em] text-muted">
                    {definition?.category.toUpperCase()} · {definition?.width}×{definition?.height}
                  </p>
                  <p className="mt-1.5 text-xs text-caution">{formatCredits(row.value)} cr</p>
                  <StashActions entryId={row.id} quantity={row.quantity} />
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </Shell>
  );
}
