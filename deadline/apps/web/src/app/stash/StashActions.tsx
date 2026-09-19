'use client';

import { useState, useTransition } from 'react';
import { sellItem, setInventoryContainer } from '@/lib/actions/player';

/** Per-stack actions: pack it for the next raid, or sell it to the vendor. */
export function StashActions({ entryId, quantity }: { entryId: string; quantity: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (task: () => Promise<{ ok: boolean; message: string }>) => {
    startTransition(async () => {
      const result = await task();
      setError(result.ok ? null : result.message);
    });
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-edge pt-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setInventoryContainer(entryId, 'loadout_backpack'))}
        className="text-[10px] tracking-[0.2em] text-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        PACK
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setInventoryContainer(entryId, 'loadout_secure'))}
        className="text-[10px] tracking-[0.2em] text-uncommon transition-colors hover:underline disabled:opacity-50"
      >
        SECURE
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => sellItem(entryId, quantity))}
        className="ml-auto text-[10px] tracking-[0.2em] text-signal transition-colors hover:underline disabled:opacity-50"
      >
        SELL
      </button>
      {error && <span className="w-full text-[10px] text-signal">{error}</span>}
    </div>
  );
}
