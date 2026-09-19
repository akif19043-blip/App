'use client';

import { PlayerRaidState, getItem } from '@deadline/shared';
import { formatCredits, formatDuration } from '@deadline/ui';
import type { HudSnapshot } from '@/game/store';

/**
 * Post-match screen: EXTRACTED / KIA / MIA plus the raid ledger.
 *
 * The numbers here come from the server's summary message, which is only sent
 * after the raid has actually been written to the database.
 */
export function PostMatch({
  hud,
  onReturnToMenu,
}: {
  hud: HudSnapshot;
  onReturnToMenu: () => void;
}) {
  const summary = hud.summary;
  const result =
    summary?.result ??
    (hud.raidState === PlayerRaidState.Extracted
      ? 'extracted'
      : hud.raidState === PlayerRaidState.MIA
        ? 'mia'
        : 'kia');

  const title = result === 'extracted' ? 'EXTRACTED' : result === 'mia' ? 'MIA' : 'KIA';
  const tone =
    result === 'extracted' ? 'text-uncommon' : result === 'mia' ? 'text-caution' : 'text-signal';

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-void/92 px-6">
      <div className="dl-panel dl-cut w-full max-w-2xl p-8">
        <p className="text-[10px] tracking-[0.5em] text-muted">RAID REPORT</p>
        <h2 className={`dl-heading mt-1 text-6xl font-bold ${tone}`}>{title}</h2>
        <p className="mt-2 text-sm text-muted">
          {result === 'extracted'
            ? 'Everything in your bag has been moved to the stash.'
            : result === 'mia'
              ? 'The deadline passed with you still inside. Your raid gear is gone.'
              : 'You went down in Sector Zero. Only your secure container came home.'}
        </p>

        {summary ? (
          <>
            <dl className="mt-7 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-edge py-6 sm:grid-cols-3">
              <Metric label="SURVIVAL TIME" value={formatDuration(summary.survivalSeconds)} />
              <Metric label="PLAYERS KILLED" value={String(summary.playerKills)} />
              <Metric label="AI KILLED" value={String(summary.aiKills)} />
              <Metric label="DAMAGE" value={String(Math.round(summary.damageDealt))} />
              <Metric
                label="LOOT EXTRACTED"
                value={`${formatCredits(summary.lootValue)} cr`}
                tone="text-caution"
              />
              <Metric
                label="XP EARNED"
                value={`+${formatCredits(summary.xpEarned)}`}
                tone="text-rare"
              />
            </dl>

            {summary.levelAfter > summary.levelBefore && (
              <p className="dl-heading mt-4 text-lg text-caution">
                LEVEL UP — {summary.levelBefore} → {summary.levelAfter}
              </p>
            )}

            {summary.creditsEarned > 0 && (
              <p className="mt-2 text-xs text-uncommon">
                Mission rewards: +{formatCredits(summary.creditsEarned)} credits
              </p>
            )}

            {summary.loot.length > 0 && (
              <div className="mt-5">
                <h3 className="dl-heading mb-2 text-xs text-muted">RECOVERED</h3>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {summary.loot.map((line, index) => (
                    <li
                      key={`${line.itemId}_${index}`}
                      className="flex justify-between border border-edge bg-void/40 px-3 py-1.5 text-xs"
                    >
                      <span>
                        {getItem(line.itemId)?.name ?? line.itemId}
                        {line.quantity > 1 && <span className="text-muted"> ×{line.quantity}</span>}
                      </span>
                      <span className="font-mono text-caution">{formatCredits(line.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="mt-8 text-sm text-muted">Filing the raid report…</p>
        )}

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={onReturnToMenu}
            className="dl-heading bg-signal px-8 py-3 text-base font-semibold text-void"
          >
            Return to menu
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-[0.25em] text-muted">{label}</dt>
      <dd className={`dl-heading text-2xl ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  );
}
