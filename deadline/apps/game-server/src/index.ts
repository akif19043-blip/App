import http from 'node:http';
import { Server } from '@colyseus/core';
import { Encoder } from '@colyseus/schema';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { serverConfig, persistenceEnabled } from './config.js';
import { log, errorFields } from './logger.js';
import { RaidRoom } from './rooms/raidRoom.js';
import { getPersistence } from './persistence/index.js';

/**
 * DEADLINE game server.
 *
 * Express serves the health endpoint (and, in development, a small debug API);
 * Colyseus owns the WebSocket transport and the authoritative raid rooms.
 */
// Sector Zero replicates ~100 loot containers plus every player and enemy, so
// a full-state sync is larger than the schema encoder's 8 KB default buffer.
Encoder.BUFFER_SIZE = 64 * 1024;

async function bootstrap(): Promise<void> {
  const app = express();

  app.use(
    cors({
      origin: serverConfig.corsOrigins.includes('*') ? true : [...serverConfig.corsOrigins],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/status', (_request, response) => {
    response.json({
      status: 'ok',
      version: '0.1.0',
      environment: serverConfig.nodeEnv,
      persistence: persistenceEnabled ? 'supabase' : 'file',
      tickRate: serverConfig.game.serverTickRate,
      snapshotRate: serverConfig.game.snapshotRate,
      maxPlayers: serverConfig.game.maxPlayers,
      matchDurationSeconds: serverConfig.game.matchDurationSeconds,
      botsEnabled: serverConfig.game.enableBots,
      debugTools: serverConfig.debugTools,
    });
  });

  const httpServer = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  gameServer.define('raid', RaidRoom).filterBy(['mapId']);

  // Warm the persistence adapter so a misconfiguration is visible at boot.
  await getPersistence();

  await gameServer.listen(serverConfig.port, undefined, undefined, () => undefined);
  log.info('server.listening', {
    port: serverConfig.port,
    host: serverConfig.host,
    environment: serverConfig.nodeEnv,
    debugTools: serverConfig.debugTools,
  });

  const shutdown = async (signal: string): Promise<void> => {
    log.info('server.shutdown', { signal });
    try {
      await gameServer.gracefullyShutdown(false);
    } catch (error) {
      log.error('server.shutdown_failed', errorFields(error));
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    log.error('server.unhandled_rejection', errorFields(reason));
  });
  process.on('uncaughtException', (error) => {
    log.error('server.uncaught_exception', errorFields(error));
  });
}

bootstrap().catch((error: unknown) => {
  log.error('server.bootstrap_failed', errorFields(error));
  process.exit(1);
});
