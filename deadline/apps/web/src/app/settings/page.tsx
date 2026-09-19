import { redirect } from 'next/navigation';
import { DEFAULT_GAME_CONFIG } from '@deadline/shared';
import { Panel } from '@/components/Panel';
import { Shell } from '@/components/Shell';
import { publicEnv, supabaseConfigured } from '@/lib/env';
import { loadOperator } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';
import { SettingsForm } from './SettingsForm';
import { SignOutButton } from './SignOutButton';

export default async function SettingsPage() {
  if (!(await getSessionUser())) redirect('/login');
  const operator = await loadOperator();

  return (
    <Shell operator={operator} active="/settings">
      <h1 className="dl-heading mb-6 text-3xl font-bold">Settings</h1>

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsForm />

        <Panel title="SESSION">
          <dl className="space-y-3 text-xs">
            <Row label="OPERATOR" value={operator.profile.username} />
            <Row label="AUTH" value={supabaseConfigured() ? 'Supabase' : 'Demo (local)'} />
            <Row label="GAME SERVER" value={publicEnv.gameServerUrl} />
            <Row
              label="RAID LENGTH"
              value={`${DEFAULT_GAME_CONFIG.matchDurationSeconds / 60} minutes`}
            />
            <Row label="MAX OPERATORS" value={String(DEFAULT_GAME_CONFIG.maxPlayers)} />
          </dl>
          <div className="mt-6 border-t border-edge pt-4">
            <SignOutButton />
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="tracking-[0.25em] text-muted">{label}</dt>
      <dd className="truncate font-mono text-ink">{value}</dd>
    </div>
  );
}
