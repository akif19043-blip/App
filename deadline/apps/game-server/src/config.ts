import 'dotenv/config';
import { resolveGameConfig, type GameConfig } from '@deadline/shared';

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  /** Enables the in-raid debug commands and the /debug HTTP routes. */
  readonly debugTools: boolean;
  readonly corsOrigins: readonly string[];
  readonly supabaseUrl: string | null;
  readonly supabaseServiceRoleKey: string | null;
  readonly supabaseAnonKey: string | null;
  /** Allows unauthenticated demo joins — never enable in production. */
  readonly allowDemoAuth: boolean;
  readonly game: GameConfig;
  readonly botDifficulty: string;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function required(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : null;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw === 'true' || raw === '1';
}

const nodeEnv = process.env['NODE_ENV'] ?? 'development';
const isProduction = nodeEnv === 'production';

export const serverConfig: ServerConfig = {
  port: Number(process.env['GAME_SERVER_PORT'] ?? process.env['PORT'] ?? 2567),
  host: process.env['GAME_SERVER_HOST'] ?? '0.0.0.0',
  nodeEnv,
  isProduction,
  debugTools: bool('ENABLE_DEBUG_TOOLS', !isProduction),
  corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  supabaseUrl: required('SUPABASE_URL') ?? required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY') ?? required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  allowDemoAuth: bool('ALLOW_DEMO_AUTH', !isProduction),
  game: resolveGameConfig(process.env),
  botDifficulty: process.env['BOT_DIFFICULTY'] ?? 'normal',
  logLevel: (process.env['LOG_LEVEL'] as ServerConfig['logLevel']) ?? 'info',
};

/** True when persistence is wired up; the server still runs without it. */
export const persistenceEnabled =
  serverConfig.supabaseUrl !== null && serverConfig.supabaseServiceRoleKey !== null;
