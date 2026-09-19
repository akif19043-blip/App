'use client';

import { useMemo, useState, useTransition } from 'react';
import { formatCredits, rarityColor } from '@deadline/ui';
import { Empty, Panel } from '@/components/Panel';
import { buyItem, sellItem } from '@/lib/actions/player';

interface StockItem {
  id: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  price: number;
  width: number;
  height: number;
}

interface StashItem {
  id: string;
  itemId: string;
  name: string;
  rarity: string;
  quantity: number;
  unitSellPrice: number;
}

const TABS = [
  { id: 'weapon', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'medical', label: 'Medical' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'sell', label: 'Sell' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * NPC vendor. Prices and the player's balance are re-derived on the server for
 * every transaction; this component only chooses what to ask for.
 */
export function MarketBrowser({
  credits,
  stock,
  stash,
}: {
  credits: number;
  stock: StockItem[];
  stash: StashItem[];
}) {
  const [tab, setTab] = useState<TabId>('weapon');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (tab === 'sell') return [];
    if (tab === 'equipment') {
      return stock.filter((item) => item.category === 'ammo' || item.category === 'crafting');
    }
    return stock.filter((item) => item.category === tab);
  }, [stock, tab]);

  const run = (task: () => Promise<{ ok: boolean; message: string }>) => {
    startTransition(async () => {
      const result = await task();
      setMessage(result.message);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="dl-heading text-3xl font-bold">Market</h1>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.3em] text-muted">BALANCE</div>
          <div className="dl-heading text-2xl text-caution">{formatCredits(credits)} cr</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-edge">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={[
              'dl-heading px-4 py-2 text-sm transition-colors',
              tab === entry.id ? 'border-b-2 border-signal text-ink' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {message && (
        <p className="border border-edge bg-raised px-4 py-2 text-xs text-muted">{message}</p>
      )}

      {tab === 'sell' ? (
        <Panel title="YOUR STASH">
          {stash.length === 0 ? (
            <Empty>Nothing to sell. Extract with loot first.</Empty>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stash.map((row) => (
                <div
                  key={row.id}
                  className="border border-edge border-l-2 bg-void/40 px-3 py-2.5"
                  style={{ borderLeftColor: rarityColor(row.rarity) }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="dl-heading text-sm">{row.name}</span>
                    <span className="font-mono text-xs text-muted">×{row.quantity}</span>
                  </div>
                  <p className="mt-1 text-xs text-caution">
                    {formatCredits(row.unitSellPrice)} cr each
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => sellItem(row.id, 1))}
                      className="dl-heading border border-edge px-3 py-1 text-[11px] hover:border-signal disabled:opacity-50"
                    >
                      Sell 1
                    </button>
                    {row.quantity > 1 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => sellItem(row.id, row.quantity))}
                        className="dl-heading border border-edge px-3 py-1 text-[11px] hover:border-signal disabled:opacity-50"
                      >
                        Sell all ({formatCredits(row.unitSellPrice * row.quantity)} cr)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="VENDOR STOCK">
          {filtered.length === 0 ? (
            <Empty>Nothing stocked in this category yet.</Empty>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => {
                const affordable = credits >= item.price;
                return (
                  <div
                    key={item.id}
                    className="border border-edge border-l-2 bg-void/40 px-3 py-2.5"
                    style={{ borderLeftColor: rarityColor(item.rarity) }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="dl-heading text-sm">{item.name}</span>
                      <span className="text-[9px] tracking-[0.2em] text-muted">
                        {item.width}×{item.height}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-caution">{formatCredits(item.price)} cr</span>
                      <button
                        type="button"
                        disabled={pending || !affordable}
                        onClick={() => run(() => buyItem(item.id, 1))}
                        className="dl-heading border border-edge px-3 py-1 text-[11px] transition-colors hover:border-signal disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {affordable ? 'Buy' : 'Too expensive'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
