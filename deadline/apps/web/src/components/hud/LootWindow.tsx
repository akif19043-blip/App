'use client';

import type { RefObject } from 'react';
import { getItem } from '@deadline/shared';
import { formatCredits, rarityColor } from '@deadline/ui';
import type { GameClient } from '@/game/gameClient';
import type { LootOffer } from '@/game/store';

/**
 * Container contents.
 *
 * Only shown after the server confirms the container was opened — the client
 * has no way to know what is inside before that.
 */
export function LootWindow({
  client,
  offer,
}: {
  client: RefObject<GameClient | null>;
  offer: LootOffer;
}) {
  const total = offer.items.reduce((sum, item) => {
    const definition = getItem(item.itemId);
    return sum + (definition?.value ?? 0) * item.quantity;
  }, 0);

  return (
    <div className="pointer-events-auto absolute top-1/2 left-1/2 w-[26rem] -translate-x-1/2 -translate-y-1/2">
      <div className="dl-panel dl-cut">
        <header className="flex items-center justify-between border-b border-edge px-4 py-2">
          <h3 className="dl-heading text-sm">CONTAINER</h3>
          <span className="text-[10px] tracking-[0.25em] text-caution">
            {formatCredits(total)} CR
          </span>
        </header>

        <div className="max-h-72 overflow-y-auto p-2">
          {offer.items.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted">Empty.</p>
          ) : (
            offer.items.map((item) => {
              const definition = getItem(item.itemId);
              return (
                <button
                  key={item.worldItemId}
                  type="button"
                  onClick={() =>
                    client.current?.takeLoot(offer.containerId, item.worldItemId, 'backpack')
                  }
                  className="mb-1 flex w-full items-center justify-between border border-edge border-l-2 bg-void/50 px-3 py-2 text-left transition-colors hover:border-signal"
                  style={{ borderLeftColor: rarityColor(definition?.rarity ?? 'common') }}
                >
                  <span className="text-xs">
                    {definition?.name ?? item.itemId}
                    {item.quantity > 1 && <span className="text-muted"> ×{item.quantity}</span>}
                  </span>
                  <span className="font-mono text-[10px] text-caution">
                    {formatCredits((definition?.value ?? 0) * item.quantity)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <footer className="flex gap-2 border-t border-edge p-3">
          <button
            type="button"
            onClick={() => client.current?.takeAllLoot()}
            disabled={offer.items.length === 0}
            className="dl-heading flex-1 bg-signal px-3 py-2 text-xs font-semibold text-void disabled:opacity-40"
          >
            Take all
          </button>
          <button
            type="button"
            onClick={() => client.current?.closeLootOffer()}
            className="dl-heading border border-edge px-4 py-2 text-xs text-muted hover:text-ink"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
