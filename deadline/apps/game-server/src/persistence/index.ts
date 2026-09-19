import {
  FilePersistence,
  SupabasePersistence,
  defaultDemoDatabasePath,
  type Persistence,
} from '@deadline/persistence';
import { persistenceEnabled, serverConfig } from '../config.js';
import { getServiceClient } from '../supabase.js';
import { log } from '../logger.js';

let cached: Persistence | null = null;
let announced = false;

/**
 * Resolve the persistence adapter for this process.
 *
 * Supabase when it is configured; otherwise a file-backed store so a developer
 * can play the full loop — deploy, loot, extract, stash — without provisioning
 * anything. The file store is explicitly not for production.
 */
export async function getPersistence(): Promise<Persistence | null> {
  if (cached) return cached;

  if (persistenceEnabled) {
    const client = getServiceClient();
    if (client) {
      cached = new SupabasePersistence(client, { serviceRole: true });
      if (!announced) {
        announced = true;
        log.info('persistence.mode', { mode: 'supabase' });
      }
      return cached;
    }
  }

  if (serverConfig.isProduction) {
    log.error('persistence.missing', {
      detail: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production',
    });
    return null;
  }

  const path = defaultDemoDatabasePath();
  cached = new FilePersistence(path);
  if (!announced) {
    announced = true;
    log.warn('persistence.mode', { mode: 'file', path });
  }
  return cached;
}
