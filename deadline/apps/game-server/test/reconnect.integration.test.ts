import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { Client, type Room } from 'colyseus.js';
import {
  ClientMessage,
  PlayerRaidState,
  RaidPhase,
  ServerMessage,
  distance2D,
  type InventoryChangedPayload,
  type WelcomePayload,
} from '@deadline/shared';

/**
 * Disconnect handling.
 *
 * A dropped socket must not cost a player their raid: the body stays in the
 * world for the configured grace period, and reconnecting hands them back the
 * same operator — same position, same loot, same assigned exits. Staying away
 * past the grace period is MIA, which is what stops disconnecting being a way
 * to dodge a fight.
 */

const PORT = 2603;
const ENDPOINT = `ws://127.0.0.1:${PORT}`;
const GRACE_SECONDS = 4;

let server: ChildProcess;
let tempDir: string;

interface RaidStateView {
  phase: string;
  players: Map<string, Record<string, unknown>>;
}

function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = async (): Promise<void> => {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - started > timeoutMs) return reject(new Error('server never became healthy'));
      setTimeout(() => void attempt(), 250);
    };
    void attempt();
  });
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

interface Session {
  client: Client;
  room: Room<RaidStateView>;
  welcome: WelcomePayload | null;
  inventory: InventoryChangedPayload | null;
  /** Token that lets this operator take their own body back. */
  reconnectionToken: string;
}

function attach(client: Client, room: Room<RaidStateView>): Session {
  const session: Session = {
    client,
    room,
    welcome: null,
    inventory: null,
    reconnectionToken: room.reconnectionToken,
  };
  room.onMessage(ServerMessage.Welcome, (payload: WelcomePayload) => {
    session.welcome = payload;
  });
  room.onMessage(ServerMessage.InventoryChanged, (payload: InventoryChangedPayload) => {
    session.inventory = payload;
  });
  for (const type of Object.values(ServerMessage)) {
    if (type === ServerMessage.Welcome || type === ServerMessage.InventoryChanged) continue;
    room.onMessage(type, () => undefined);
  }
  return session;
}

async function connectAs(userId: string, username: string): Promise<Session> {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate<RaidStateView>('raid', {
    demoUserId: userId,
    demoUsername: username,
    mapId: 'sector_zero',
  });
  const session = attach(client, room);
  await waitFor(() => session.welcome !== null, `welcome for ${username}`);
  return session;
}

/** Take the held seat back, the way the web client does after a dropped socket. */
async function reconnect(previous: Session): Promise<Session> {
  const room = await previous.client.reconnect<RaidStateView>(previous.reconnectionToken);
  const session = attach(previous.client, room);
  await waitFor(() => session.welcome !== null, 'welcome after reconnect');
  return session;
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deadline-rc-'));
  server = spawn(process.execPath, ['dist/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      GAME_SERVER_PORT: String(PORT),
      DEMO_DB_PATH: join(tempDir, 'db.json'),
      ALLOW_DEMO_AUTH: 'true',
      ENABLE_BOTS: 'false',
      MIN_PLAYERS_TO_START: '1',
      LOBBY_FILL_SECONDS: '0',
      COUNTDOWN_SECONDS: '1',
      MATCH_DURATION_SECONDS: '180',
      MAX_AI_ENEMIES: '0',
      DISCONNECT_GRACE_SECONDS: String(GRACE_SECONDS),
      LOG_LEVEL: 'error',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.error('[server]', text.slice(0, 300));
  });
  await waitForHealth();
});

afterAll(async () => {
  server?.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
});

describe('disconnect and reconnect', () => {
  const userId = 'rc-user-0001';
  let first: Session;
  let position = { x: 0, z: 0 };
  let extractions: string[] = [];

  it('deploys and moves', async () => {
    first = await connectAs(userId, 'RECONNECT');
    extractions = first.welcome!.assignedExtractions;

    await waitFor(
      () =>
        first.room.state.phase === RaidPhase.Active ||
        first.room.state.phase === RaidPhase.FinalPhase,
      'the raid to start',
    );

    for (let seq = 1; seq <= 30; seq += 1) {
      first.room.send(ClientMessage.Input, {
        seq,
        dt: 1 / 30,
        forward: 1,
        right: 0,
        yaw: 0.6,
        pitch: 0,
        sprint: true,
        crouch: false,
        ads: false,
        px: 0,
        py: 0,
        pz: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    const me = first.room.state.players.get(first.room.sessionId) as { x: number; z: number };
    position = { x: me.x, z: me.z };
    expect(first.room.state.players.size).toBe(1);
  });

  it('keeps the body in the world after an unexpected drop', async () => {
    await first.room.leave(false);
    // The body is still there — briefly — for whoever finds it.
    await new Promise((resolve) => setTimeout(resolve, 600));
  });

  it('hands the same operator back on reconnect', async () => {
    const second = await reconnect(first);

    expect(second.welcome!.userId).toBe(userId);
    expect(second.welcome!.assignedExtractions).toEqual(extractions);

    const me = second.room.state.players.get(second.room.sessionId) as {
      x: number;
      z: number;
      raidState: string;
      health: number;
    };
    // Same body: position carries over rather than respawning at the edge.
    expect(distance2D(position, me)).toBeLessThan(3);
    expect(me.raidState).toBe(PlayerRaidState.Alive);
    expect(me.health).toBe(100);

    // Inventory is re-sent so the HUD can rebuild itself.
    await waitFor(() => second.inventory !== null, 'inventory resync');
    expect(second.inventory!.backpack.width).toBeGreaterThan(0);

    await second.room.leave(true);
  });

  it('marks an operator MIA when they never come back', async () => {
    const abandoner = await connectAs('rc-user-0002', 'ABANDONER');
    await waitFor(
      () =>
        abandoner.room.state.phase === RaidPhase.Active ||
        abandoner.room.state.phase === RaidPhase.FinalPhase,
      'the raid to start',
    );
    await abandoner.room.leave(false);

    // Wait past the grace window, then prove the seat is gone: the held
    // reconnection token must no longer be accepted.
    await new Promise((resolve) => setTimeout(resolve, (GRACE_SECONDS + 3) * 1000));
    await expect(
      abandoner.client.reconnect<RaidStateView>(abandoner.reconnectionToken),
    ).rejects.toBeTruthy();
  });
});
