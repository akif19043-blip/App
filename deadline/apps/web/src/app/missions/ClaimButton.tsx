'use client';

import { useState, useTransition } from 'react';
import { claimMission } from '@/lib/actions/player';

export function ClaimButton({
  playerMissionId,
  claimed,
}: {
  playerMissionId: string;
  claimed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(claimed);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <span className="text-[10px] tracking-[0.25em] text-uncommon">CLAIMED</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await claimMission(playerMissionId);
          if (result.ok) setDone(true);
          else setError(result.message);
        })
      }
      className="dl-heading border border-uncommon px-3 py-1 text-[11px] text-uncommon transition-colors hover:bg-uncommon hover:text-void disabled:opacity-50"
    >
      {error ?? (pending ? 'Claiming…' : 'Claim')}
    </button>
  );
}
