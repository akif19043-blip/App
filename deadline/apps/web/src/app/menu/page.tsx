import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEFAULT_GAME_CONFIG, SECTOR_ZERO } from '@deadline/shared';
import { formatCompact, formatCredits, formatDuration } from '@deadline/ui';
import { Panel, Stat } from '@/components/Panel';
import { Shell, XpBar } from '@/components/Shell';
import { loadOperator, loadRaidHistory } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';
import { Tutorial } from './Tutorial';

const RISK_LABEL: Record<string, string> = {
  low: 'LOW RISK',
  medium: 'MEDIUM RISK',
  high: 'HIGH RISK',
  very_high: 'EXTREME RISK',
};

const RISK_TONE: Record<string, string> = {
  low: 'text-muted',
  medium: 'text-uncommon',
  high: 'text-caution',
  very_high: 'text-signal',
};

export default async function MenuPage() {
  if (!(await getSessionUser())) redirect('/login');
  const [operator, history] = await Promise.all([loadOperator(), loadRaidHistory(6)]);

  return (
    <Shell operator={operator} active="/menu">
      {!operator.profile.tutorialDone && <Tutorial />}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-signal/10 via-transparent to-transparent" />
            <div className="relative">
              <p className="text-[10px] tracking-[0.4em] text-signal">OPERATION</p>
              <h1 className="dl-heading mt-1 text-5xl font-bold">{SECTOR_ZERO.name}</h1>
              <p className="mt-2 max-w-lg text-sm text-muted">{SECTOR_ZERO.tagline}</p>

              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="RAID LENGTH" value={`${DEFAULT_GAME_CONFIG.matchDurationSeconds / 60} MIN`} />
                <Stat label="OPERATORS" value={String(DEFAULT_GAME_CONFIG.maxPlayers)} />
                <Stat label="EXITS" value={String(DEFAULT_GAME_CONFIG.extractionsPerPlayer)} tone="text-uncommon" />
                <Stat label="DISTRICTS" value={String(SECTOR_ZERO.pois.length)} />
              </div>

              <Link
                href="/play"
                className="dl-heading dl-glow-signal mt-8 inline-block bg-signal px-12 py-4 text-2xl font-bold text-void transition-transform hover:-translate-y-0.5"
              >
                DEPLOY
              </Link>
              <p className="mt-3 text-[11px] tracking-[0.2em] text-muted">
                QUICK PLAY · SOLO QUEUE · AI RAIDERS FILL EMPTY SLOTS
              </p>
            </div>
          </Panel>

          <Panel title="SECTOR ZERO — RISK MAP">
            <div className="grid gap-2 sm:grid-cols-2">
              {SECTOR_ZERO.pois.map((poi) => (
                <div key={poi.id} className="border border-edge bg-void/40 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="dl-heading text-sm">{poi.name}</span>
                    <span className={`text-[9px] tracking-[0.2em] ${RISK_TONE[poi.risk]}`}>
                      {RISK_LABEL[poi.risk]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{poi.description}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="OPERATOR">
            <XpBar operator={operator} />
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Stat label="RAIDS" value={String(operator.stats.raids)} />
              <Stat
                label="EXTRACTIONS"
                value={String(operator.stats.successfulExtractions)}
                tone="text-uncommon"
              />
              <Stat label="DEATHS" value={String(operator.stats.deaths)} tone="text-signal" />
              <Stat label="PLAYER KILLS" value={String(operator.stats.playerKills)} />
              <Stat label="AI KILLS" value={String(operator.stats.aiKills)} />
              <Stat
                label="LOOT EXTRACTED"
                value={formatCompact(operator.stats.lootExtractedValue)}
                tone="text-caution"
              />
            </div>
          </Panel>

          <Panel title="RECENT RAIDS">
            {history.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                No raids yet. Sector Zero is waiting.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((raid) => (
                  <li
                    key={raid.id}
                    className="flex items-center justify-between border border-edge bg-void/40 px-3 py-2 text-xs"
                  >
                    <span
                      className={
                        raid.result === 'extracted'
                          ? 'dl-heading text-uncommon'
                          : raid.result === 'kia'
                            ? 'dl-heading text-signal'
                            : 'dl-heading text-caution'
                      }
                    >
                      {raid.result?.toUpperCase() ?? 'UNKNOWN'}
                    </span>
                    <span className="text-muted">{formatDuration(raid.survivalSeconds)}</span>
                    <span className="text-caution">{formatCredits(raid.lootValue)} cr</span>
                    <span className="text-muted">+{formatCompact(raid.xpEarned)} xp</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
