import { redirect } from 'next/navigation';
import { dailyResetKey } from '@deadline/shared';
import { formatCredits } from '@deadline/ui';
import { Empty, Panel } from '@/components/Panel';
import { Shell } from '@/components/Shell';
import { loadMissions, loadOperator } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';
import { ClaimButton } from './ClaimButton';

export default async function MissionsPage() {
  if (!(await getSessionUser())) redirect('/login');
  const [operator, missions] = await Promise.all([loadOperator(), loadMissions()]);

  return (
    <Shell operator={operator} active="/missions">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="dl-heading text-3xl font-bold">Missions</h1>
        <span className="text-[10px] tracking-[0.25em] text-muted">
          DAILY RESET {dailyResetKey()} UTC
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="DAILY CONTRACTS">
          {missions.daily.length === 0 ? (
            <Empty>Today’s contracts have not been issued yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {missions.daily.map((mission) => (
                <MissionRow key={mission.definition.id} mission={mission} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="CAMPAIGN">
          {missions.campaign.length === 0 ? (
            <Empty>No contracts available at your level.</Empty>
          ) : (
            <ul className="space-y-2">
              {missions.campaign.map((mission) => (
                <MissionRow key={mission.definition.id} mission={mission} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Shell>
  );
}

function MissionRow({
  mission,
}: {
  mission: Awaited<ReturnType<typeof loadMissions>>['daily'][number];
}) {
  const ratio = Math.min(1, mission.progress / mission.definition.target);
  return (
    <li className="border border-edge bg-void/40 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="dl-heading text-sm">{mission.definition.name}</span>
        <span className="font-mono text-[11px] text-muted">
          {Math.min(mission.progress, mission.definition.target).toLocaleString()} /{' '}
          {mission.definition.target.toLocaleString()}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{mission.definition.description}</p>

      <div className="mt-2 h-1 w-full bg-edge">
        <div
          className={mission.completed ? 'h-full bg-uncommon' : 'h-full bg-signal'}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[10px] tracking-[0.2em] text-muted">
          +{mission.definition.xpReward.toLocaleString()} XP ·{' '}
          <span className="text-caution">
            +{formatCredits(mission.definition.creditReward)} CR
          </span>
        </span>
        {mission.completed && mission.row && (
          <ClaimButton playerMissionId={mission.row.id} claimed={mission.claimed} />
        )}
      </div>
    </li>
  );
}
