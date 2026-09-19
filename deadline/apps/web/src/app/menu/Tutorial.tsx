'use client';

import { useState, useTransition } from 'react';
import { completeTutorial } from '@/lib/actions/player';

const CONTROLS = [
  ['WASD', 'MOVE'],
  ['MOUSE', 'AIM'],
  ['SHIFT', 'SPRINT'],
  ['LMB', 'FIRE'],
  ['RMB', 'AIM DOWN SIGHTS'],
  ['R', 'RELOAD'],
  ['F', 'SEARCH / LOOT'],
  ['TAB', 'INVENTORY'],
  ['X', 'START EXTRACTION'],
  ['1 / 2', 'SWAP WEAPON'],
] as const;

/** First-time briefing. Dismissible, and never shown again once acknowledged. */
export function Tutorial() {
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (dismissed) return null;

  const close = (persist: boolean) => {
    setDismissed(true);
    if (persist) startTransition(() => void completeTutorial());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 px-6">
      <div className="dl-panel dl-cut w-full max-w-2xl p-8">
        <p className="text-[10px] tracking-[0.4em] text-signal">FIRST DEPLOYMENT</p>
        <h2 className="dl-heading mt-1 text-3xl font-bold">Welcome to Sector Zero</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          You have ten minutes. Search buildings and bodies, take what you can carry, and reach one
          of your two assigned exits. Die and everything except your secure container stays behind.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 border-y border-edge py-5 sm:grid-cols-2">
          {CONTROLS.map(([key, action]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="dl-heading border border-edge px-2 py-0.5 text-ink">{key}</span>
              <span className="tracking-[0.2em] text-muted">{action}</span>
            </div>
          ))}
        </div>

        <p className="dl-heading mt-6 text-lg text-caution">
          FIND LOOT. SURVIVE. EXTRACT BEFORE THE DEADLINE.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => close(true)}
            disabled={pending}
            className="dl-heading bg-signal px-6 py-2.5 text-sm font-semibold text-void disabled:opacity-60"
          >
            Understood
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="dl-heading border border-edge px-6 py-2.5 text-sm text-muted hover:text-ink"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
