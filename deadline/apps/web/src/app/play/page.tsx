import { redirect } from 'next/navigation';
import { SECTOR_ZERO } from '@deadline/shared';
import { publicEnv } from '@/lib/env';
import { getPersistence } from '@/lib/persistence';
import { getSessionUser } from '@/lib/session';
import { RaidClient } from './RaidClient';

/**
 * The raid screen.
 *
 * Everything below the fold here is a client component driving a WebGL canvas;
 * this server component only resolves who is deploying and with which loadout,
 * then hands the connection parameters over.
 */
export default async function PlayPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const persistence = await getPersistence();
  await persistence.ensureProfile(user.id, user.username);
  const loadout = await persistence.getActiveLoadout(user.id);

  return (
    <RaidClient
      endpoint={publicEnv.gameServerUrl}
      mapId={SECTOR_ZERO.id}
      loadoutId={loadout?.id ?? null}
      accessToken={user.accessToken}
      demoUserId={user.demo ? user.id : null}
      demoUsername={user.demo ? user.username : null}
    />
  );
}
