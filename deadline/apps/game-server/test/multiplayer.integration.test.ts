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
  SECTOR_ZERO,
  ServerMessage,
  distance2D,
  type ContainerOpenedPayload,
  type PlayerDiedPayload,
  type WelcomePayload,
} from '@deadline/shared';

/**
 * Two real clients, one room.
 *
 * This is the test that backs the word "multiplayer": two independent Colyseus
 * connections join the same raid, see each other in the replicated state, and
 * one kills the other through the authoritative combat pipeline — leaving a
 * lootable body the killer can actually take loot from.
 */

const PORT = 2601;
const ENDPOINT = `ws://127.0.0.1:${PORT}`;

let server: ChildProcess;
let tempDir: string;

interface RaidStateView {
  phase: string;
  players: Map<string, Record<string, unknown>>;
  containers: Map<string, Record<string, unknown>>;
}

interface Connected {
  room: Room<RaidStateView>;
  welcome: WelcomePayload;
  deaths: PlayerDiedPayload[];
  opened: ContainerOpenedPayload[];
  rejections: string[];
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

async function connect(userId: string, username: string): Promise<Connected> {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate<RaidStateView>('raid', {
    demoUserId: userId,
    demoUsername: username,
    mapId: 'sector_zero',
  });

  const connected: Connected = {
    room,
    welcome: null as unknown as WelcomePayload,
    deaths: [],
    opened: [],
    rejections: [],
  };

  room.onMessage(ServerMessage.Welcome, (payload: WelcomePayload) => {
    connected.welcome = payload;
  });
  room.onMessage(ServerMessage.PlayerDied, (payload: PlayerDiedPayload) => {
    connected.deaths.push(payload);
  });
  room.onMessage(ServerMessage.ContainerOpened, (payload: ContainerOpenedPayload) => {
    connected.opened.push(payload);
  });
  room.onMessage(ServerMessage.ActionRejected, (payload: { reason: string }) => {
    connected.rejections.push(payload.reason);
  });
  // Messages we do not assert on still need a handler or colyseus.js warns.
  for (const type of [
    ServerMessage.Reconcile,
    ServerMessage.ShotFired,
    ServerMessage.DamageTaken,
    ServerMessage.DamageDealt,
    ServerMessage.AIDied,
    ServerMessage.LootPicked,
    ServerMessage.InventoryChanged,
    ServerMessage.ExtractionStarted,
    ServerMessage.ExtractionCancelled,
    ServerMessage.ExtractionCompleted,
    ServerMessage.MatchPhase,
    ServerMessage.MatchEnded,
    ServerMessage.RaidSummaryReady,
    ServerMessage.Announcement,
    ServerMessage.SupplyDrop,
    ServerMessage.PlayerJoined,
    ServerMessage.PlayerLeft,
    ServerMessage.Pong,
  ]) {
    room.onMessage(type, () => undefined);
  }

  await waitFor(() => connected.welcome !== null, `welcome for ${username}`);
  return connected;
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deadline-mp-'));
  server = spawn(process.execPath, ['dist/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      GAME_SERVER_PORT: String(PORT),
      DEMO_DB_PATH: join(tempDir, 'db.json'),
      ALLOW_DEMO_AUTH: 'true',
      ENABLE_BOTS: 'false',
      // Both operators must be able to join before the room locks.
      MIN_PLAYERS_TO_START: '2',
      LOBBY_FILL_SECONDS: '20',
      COUNTDOWN_SECONDS: '1',
      MATCH_DURATION_SECONDS: '180',
      MAX_AI_ENEMIES: '0',
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

describe('two operators in one raid', () => {
  let alpha: Connected;
  let bravo: Connected;

  it('puts both clients in the same room', async () => {
    alpha = await connect('mp-user-alpha', 'ALPHA');
    bravo = await connect('mp-user-bravo', 'BRAVO');

    expect(alpha.room.roomId).toBe(bravo.room.roomId);
    await waitFor(
      () => alpha.room.state.players.size === 2 && bravo.room.state.players.size === 2,
      'both players in the replicated state',
    );
  });

  it('starts the raid once the lobby is full enough', async () => {
    await waitFor(
      () =>
        alpha.room.state.phase === RaidPhase.Active ||
        alpha.room.state.phase === RaidPhase.FinalPhase,
      'the raid to start',
    );
    const me = alpha.room.state.players.get(alpha.room.sessionId) as { raidState: string };
    expect(me.raidState).toBe(PlayerRaidState.Alive);
  });

  it('replicates each operator to the other', async () => {
    const alphaSeesBravo = alpha.room.state.players.get(bravo.room.sessionId) as {
      username: string;
      health: number;
    };
    const bravoSeesAlpha = bravo.room.state.players.get(alpha.room.sessionId) as {
      username: string;
    };
    expect(alphaSeesBravo.username).toBe('BRAVO');
    expect(bravoSeesAlpha.username).toBe('ALPHA');
    expect(alphaSeesBravo.health).toBe(100);
  });

  it('replicates movement from one client to the other', async () => {
    const bravoAsSeenByAlpha = () =>
      alpha.room.state.players.get(bravo.room.sessionId) as { x: number; z: number };
    const before = { x: bravoAsSeenByAlpha().x, z: bravoAsSeenByAlpha().z };

    for (let seq = 1; seq <= 45; seq += 1) {
      bravo.room.send(ClientMessage.Input, {
        seq,
        dt: 1 / 30,
        forward: 1,
        right: 0,
        yaw: 0,
        pitch: 0,
        sprint: true,
        crouch: false,
        ads: false,
        px: before.x,
        py: 0,
        pz: before.z,
      });
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    await waitFor(
      () => distance2D(before, bravoAsSeenByAlpha()) > 1,
      'ALPHA to see BRAVO move',
    );
  });

  it('resolves PvP damage on the server and leaves a lootable body', async () => {
    // Stage the duel on guaranteed open ground. Extraction zones are the one
    // place the map generator keeps clear of buildings and cover, so neither
    // operator can end up behind a wall — which would make this test's outcome
    // depend on where the generator happened to put a block.
    const arena = SECTOR_ZERO.extractions[2]!.position;
    const target = { x: arena.x, z: arena.z };

    bravo.room.send(ClientMessage.DebugCommand, {
      command: 'teleport',
      x: target.x,
      z: target.z,
    });
    alpha.room.send(ClientMessage.DebugCommand, {
      command: 'teleport',
      x: target.x,
      z: target.z + 4,
    });
    alpha.room.send(ClientMessage.DebugCommand, { command: 'give_weapon', value: 'ar12' });

    const bravoPosition = () =>
      bravo.room.state.players.get(bravo.room.sessionId) as { x: number; z: number };
    const alphaPosition = () =>
      alpha.room.state.players.get(alpha.room.sessionId) as { x: number; z: number };

    await waitFor(() => distance2D(bravoPosition(), target) < 2, 'BRAVO to reach the arena');
    await waitFor(() => distance2D(alphaPosition(), target) < 8, 'ALPHA to close the distance');

    const bravoHealth = () =>
      (bravo.room.state.players.get(bravo.room.sessionId) as { health: number }).health;
    const startHealth = bravoHealth();

    // Face BRAVO: yaw 0 looks down -Z, and ALPHA is at +Z relative to BRAVO.
    const aimYaw = Math.atan2(
      -(bravoPosition().x - alphaPosition().x),
      -(bravoPosition().z - alphaPosition().z),
    );

    const deadline = Date.now() + 25_000;
    while (bravoHealth() > 0 && Date.now() < deadline) {
      alpha.room.send(ClientMessage.Fire, { seq: 1, yaw: aimYaw, pitch: 0, shotId: 1 });
      await new Promise((resolve) => setTimeout(resolve, 110));
    }

    expect(bravoHealth()).toBeLessThan(startHealth);
    await waitFor(
      () =>
        (bravo.room.state.players.get(bravo.room.sessionId) as { raidState: string }).raidState ===
        PlayerRaidState.Dead,
      'BRAVO to go down',
    );

    // Both clients are told who died, and the killer is credited.
    await waitFor(() => alpha.deaths.length > 0 && bravo.deaths.length > 0, 'death events');
    const death = alpha.deaths[alpha.deaths.length - 1]!;
    expect(death.playerName).toBe('BRAVO');
    expect(death.killerName).toBe('ALPHA');
    expect(death.corpseContainerId).toBeTruthy();

    const killer = alpha.room.state.players.get(alpha.room.sessionId) as { kills: number };
    expect(killer.kills).toBe(1);

    // The body is a real container in the world, and the killer can search it
    // — after walking onto it, because interaction range is enforced server side.
    const corpseId = death.corpseContainerId!;
    await waitFor(() => alpha.room.state.containers.has(corpseId), 'the corpse container');
    const corpse = alpha.room.state.containers.get(corpseId) as { x: number; z: number };

    alpha.room.send(ClientMessage.DebugCommand, {
      command: 'teleport',
      x: corpse.x,
      z: corpse.z,
    });
    await waitFor(() => distance2D(alphaPosition(), corpse) < 2, 'ALPHA to reach the body');
    alpha.room.send(ClientMessage.Interact, { containerId: corpseId });
    await waitFor(
      () => alpha.opened.some((payload) => payload.containerId === corpseId),
      'ALPHA to search the body',
    );

    const contents = alpha.opened.find((payload) => payload.containerId === corpseId)!;
    // BRAVO deployed with a sidearm, so the body is never empty.
    expect(contents.items.length).toBeGreaterThan(0);
  });

  it('refuses a fire request from a dead operator', async () => {
    bravo.rejections.length = 0;
    bravo.room.send(ClientMessage.Fire, { seq: 99, yaw: 0, pitch: 0, shotId: 99 });
    await waitFor(() => bravo.rejections.includes('not_alive'), 'the server to refuse the shot');
    expect(bravo.rejections).toContain('not_alive');
  });

  it('lets both clients leave cleanly', async () => {
    await alpha.room.leave(true);
    await bravo.room.leave(true);
    expect(true).toBe(true);
  });
});
