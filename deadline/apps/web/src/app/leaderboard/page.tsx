import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatCredits } from '@deadline/ui';
import { Empty, Panel } from '@/components/Panel';
import { Shell } from '@/components/Shell';
import { loadLeaderboard, loadOperator } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';

const METRICS = [
  { id: 'loot', label: 'Extracted Loot' },
  { id: 'kills', label: 'Player Kills' },
  { id: 'extracts', label: 'Extractions' },
] as const;

type Metric = (typeof METRICS)[number]['id'];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/login');
  const params = await searchParams;
  const metric: Metric = METRICS.some((entry) => entry.id === params.metric)
    ? (params.metric as Metric)
    : 'loot';

  const [operator, board] = await Promise.all([loadOperator(), loadLeaderboard(metric)]);

  return (
    <Shell operator={operator} active="/leaderboard">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="dl-heading text-3xl font-bold">Weekly Leaderboard</h1>
        <span className="text-[10px] tracking-[0.25em] text-muted">
          YOUR RANK: {board.rank ? `#${board.rank}` : 'UNRANKED'}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-edge">
        {METRICS.map((entry) => (
          <Link
            key={entry.id}
            href={`/leaderboard?metric=${entry.id}`}
            className={[
              'dl-heading px-4 py-2 text-sm transition-colors',
              metric === entry.id
                ? 'border-b-2 border-signal text-ink'
                : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      <Panel title="TOP 100">
        {board.entries.length === 0 ? (
          <Empty>No ranked raids this week. Extract with loot to put yourself on the board.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-[10px] tracking-[0.25em] text-muted">
                <th className="py-2 text-left font-normal">#</th>
                <th className="py-2 text-left font-normal">OPERATOR</th>
                <th className="py-2 text-right font-normal">LVL</th>
                <th className="py-2 text-right font-normal">LOOT</th>
                <th className="py-2 text-right font-normal">KILLS</th>
                <th className="py-2 text-right font-normal">EXITS</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((row) => {
                const isMe = row.playerId === board.userId;
                return (
                  <tr
                    key={row.playerId}
                    className={[
                      'border-b border-edge/50',
                      isMe ? 'bg-signal/10 text-ink' : 'text-muted',
                    ].join(' ')}
                  >
                    <td className="py-2 font-mono">{row.rank}</td>
                    <td className="dl-heading py-2 text-ink">{row.username}</td>
                    <td className="py-2 text-right font-mono">{row.level}</td>
                    <td className="py-2 text-right font-mono text-caution">
                      {formatCredits(row.lootExtractedValue)}
                    </td>
                    <td className="py-2 text-right font-mono">{row.playerKills}</td>
                    <td className="py-2 text-right font-mono">{row.successfulExtractions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </Shell>
  );
}
