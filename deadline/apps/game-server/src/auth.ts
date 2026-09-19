import { JoinOptionsSchema, type JoinOptions } from '@deadline/shared';
import { serverConfig } from './config.js';
import { getAuthClient } from './supabase.js';
import { log } from './logger.js';

export interface AuthenticatedUser {
  readonly userId: string;
  readonly username: string;
  readonly demo: boolean;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Resolve the real user behind a join request.
 *
 * The client never gets to say who it is: the id is read out of the Supabase
 * JWT, server side. Demo mode (development only) is the single exception and
 * is gated by ALLOW_DEMO_AUTH.
 */
export async function authenticate(rawOptions: unknown): Promise<{
  user: AuthenticatedUser;
  options: JoinOptions;
}> {
  const parsed = JoinOptionsSchema.safeParse(rawOptions ?? {});
  if (!parsed.success) {
    throw new AuthError('invalid_join_options');
  }
  const options = parsed.data;

  if (options.accessToken) {
    const client = getAuthClient();
    if (!client) throw new AuthError('auth_unavailable');
    const { data, error } = await client.auth.getUser(options.accessToken);
    if (error || !data.user) {
      log.warn('auth.rejected', { reason: error?.message ?? 'no_user' });
      throw new AuthError('invalid_token');
    }
    const metadata = data.user.user_metadata as { username?: string } | null;
    return {
      user: {
        userId: data.user.id,
        username:
          metadata?.username ?? data.user.email?.split('@')[0] ?? `operator_${data.user.id.slice(0, 6)}`,
        demo: false,
      },
      options,
    };
  }

  if (serverConfig.allowDemoAuth && options.demoUserId) {
    return {
      user: {
        userId: options.demoUserId,
        username: options.demoUsername ?? `demo_${options.demoUserId.slice(0, 6)}`,
        demo: true,
      },
      options,
    };
  }

  throw new AuthError('authentication_required');
}
