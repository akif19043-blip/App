import { notFound } from 'next/navigation';
import { formatCredits, formatDuration } from '@deadline/ui';
import { Empty, Panel, Stat } from '@/components/Panel';
import { Shell } from '@/components/Shell';
import { loadOperator, loadRaidHistory } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';
import { supabaseConfigured } from '@/lib/env';

/**
 * Development admin view.
 *
 * Deliberately minimal and **development-only** — it 404s outside development.
 * It exists so the operational data (raids, economy, suspicious events) is
 * visible while building, and so a real admin panel has a shape to grow into.
 * A production panel would need its own role check and a service-role read
 * path; this one only ever shows the signed-in operator's own data.
 */
export default async function AdminPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const user = await getSessionUser();
  if (!user) notFound();

  const [operator, raids] = await Promise.all([loadOperator(), loadRaidHistory(25)]);

  const extracted = raids.filter((raid) => raid.result === 'extracted');
  const lootOut = extracted.reduce((total, raid) => total + raid.lootValue, 0);
  const survivalRate = raids.length > 0 ? Math.round((extracted.length / raids.length) * 100) : 0;

  return (
    <Shell operator={operator} active="/admin">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="dl-heading text-3xl font-bold">Admin — development</h1>
        <span className="text-[10px] tracking-[0.25em] text-caution">
          {supabaseConfigured() ? 'SUPABASE' : 'FILE STORE'}
        </span>
      </div>

      <p className="mb-6 border border-caution/30 bg-caution/5 px-4 py-2.5 text-xs text-caution">
        This page is disabled in production builds. It reads only the signed-in
        operator’s own rows — a real panel needs a role check and a service-role read path.
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="OPERATOR">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="USER ID" value={operator.user.id.slice(0, 8)} />
            <Stat label="LEVEL" value={String(operator.profile.level)} />
            <Stat label="XP" value={formatCredits(operator.profile.xp)} />
            <Stat
              label="CREDITS"
              value={formatCredits(operator.profile.credits)}
              tone="text-caution"
            />
          </div>
        </Panel>

        <Panel title="ECONOMY">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="RAIDS" value={String(operator.stats.raids)} />
            <Stat label="SURVIVAL RATE" value={`${survivalRate}%`} tone="text-uncommon" />
            <Stat label="LOOT EXTRACTED" value={formatCredits(lootOut)} tone="text-caution" />
            <Stat label="DAMAGE DEALT" value={formatCredits(operator.stats.damageDealt)} />
          </div>
        </Panel>

        <Panel title="RAID LEDGER" className="xl:col-span-2">
          {raids.length === 0 ? (
            <Empty>No raids recorded yet.</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-edge text-[10px] tracking-[0.2em] text-muted">
                  <th className="py-2 text-left font-normal">ROOM</th>
                  <th className="py-2 text-left font-normal">RESULT</th>
                  <th className="py-2 text-right font-normal">SURVIVED</th>
                  <th className="py-2 text-right font-normal">PK / AI</th>
                  <th className="py-2 text-right font-normal">LOOT</th>
                  <th className="py-2 text-right font-normal">XP</th>
                </tr>
              </thead>
              <tbody>
                {raids.map((raid) => (
                  <tr key={raid.id} className="border-b border-edge/40 text-muted">
                    <td className="py-1.5 font-mono">{raid.roomId}</td>
                    <td className="py-1.5 font-mono">{raid.result}</td>
                    <td className="py-1.5 text-right font-mono">
                      {formatDuration(raid.survivalSeconds)}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {raid.playerKills} / {raid.aiKills}
                    </td>
                    <td className="py-1.5 text-right font-mono text-caution">
                      {formatCredits(raid.lootValue)}
                    </td>
                    <td className="py-1.5 text-right font-mono">{formatCredits(raid.xpEarned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="SUSPICIOUS EVENTS" className="xl:col-span-2">
          <p className="text-xs leading-relaxed text-muted">
            Anti-cheat rejections are written to <code className="text-ink">suspicious_events</code>{' '}
            by the game server (speed, teleport, fire rate, ammo, interaction range, loot ownership,
            extraction position, schema violations). The table is write-only through the anon and
            authenticated roles, so reading it here would need a service-role query — deliberately
            not wired up in this slice. Tail the game server’s structured logs for{' '}
            <code className="text-ink">&quot;event&quot;:&quot;suspicious_event&quot;</code> instead.
          </p>
        </Panel>
      </div>
    </Shell>
  );
}
