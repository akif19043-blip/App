import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  type RaidSummary,
  type WelcomePayload,
} from '@deadline/shared';

/**
 * End-to-end raid test.
 *
 * Boots the real game server against a throwaway file database, connects a
 * real Colyseus client, and plays the full loop the MVP promises:
 * join → deploy → move → open a container → take loot → shoot → extract →
 * summary → stash written.
 */

const PORT = 2599;
const ENDPOINT = `ws://127.0.0.1:${PORT}`;

let server: ChildProcess;
let dbPath: string;
let tempDir: string;

function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = async (): Promise<void> => {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/health`);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // not up yet
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('game server did not become healthy in time'));
        return;
      }
      setTimeout(() => void attempt(), 250);
    };
    void attempt();
  });
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deadline-it-'));
  dbPath = join(tempDir, 'db.json');

  server = spawn(process.execPath, ['dist/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      GAME_SERVER_PORT: String(PORT),
      DEMO_DB_PATH: dbPath,
      ALLOW_DEMO_AUTH: 'true',
      ENABLE_BOTS: 'false',
      MIN_PLAYERS_TO_START: '1',
      LOBBY_FILL_SECONDS: '0',
      COUNTDOWN_SECONDS: '1',
      MATCH_DURATION_SECONDS: '120',
      EXTRACTION_TIME_SECONDS: '1',
      MAX_AI_ENEMIES: '6',
      LOG_LEVEL: 'error',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.trim()) console.error('[server]', text.trim());
  });

  await waitForHealth();
});

afterAll(async () => {
  server?.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
});

/** Poll until `predicate` holds, or fail the test. */
async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 30_000,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

interface RaidStateView {
  phase: string;
  timeRemaining: number;
  players: Map<string, Record<string, unknown>>;
  containers: Map<string, Record<string, unknown>>;
  enemies: Map<string, Record<string, unknown>>;
}

describe('raid integration', () => {
  let client: Client;
  let room: Room<RaidStateView>;
  let welcome: WelcomePayload | null = null;
  let summary: RaidSummary | null = null;
  let openedContainer: ContainerOpenedPayload | null = null;
  const userId = 'itest-user-0001';

  it('authenticates and joins a raid room', async () => {
    client = new Client(ENDPOINT);
    room = await client.joinOrCreate<RaidStateView>('raid', {
      demoUserId: userId,
      demoUsername: 'INTEGRATION',
      mapId: 'sector_zero',
    });

    room.onMessage(ServerMessage.Welcome, (payload: WelcomePayload) => {
      welcome = payload;
    });
    room.onMessage(ServerMessage.RaidSummaryReady, (payload: RaidSummary) => {
      summary = payload;
    });
    room.onMessage(ServerMessage.ContainerOpened, (payload: ContainerOpenedPayload) => {
      openedContainer = payload;
    });
    room.onMessage(ServerMessage.ActionRejected, () => undefined);
    // colyseus.js warns for any message type without a handler; register the
    // ones this test does not assert on so the output stays readable.
    for (const type of [
      ServerMessage.Reconcile,
      ServerMessage.ShotFired,
      ServerMessage.DamageTaken,
      ServerMessage.DamageDealt,
      ServerMessage.PlayerDied,
      ServerMessage.AIDied,
      ServerMessage.LootPicked,
      ServerMessage.InventoryChanged,
      ServerMessage.ExtractionStarted,
      ServerMessage.ExtractionCancelled,
      ServerMessage.ExtractionCompleted,
      ServerMessage.MatchPhase,
      ServerMessage.MatchEnded,
      ServerMessage.Announcement,
      ServerMessage.SupplyDrop,
      ServerMessage.PlayerJoined,
      ServerMessage.PlayerLeft,
      ServerMessage.Pong,
    ]) {
      room.onMessage(type, () => undefined);
    }

    await waitFor(() => welcome !== null, 'welcome message');
    expect(welcome!.userId).toBe(userId);
    expect(welcome!.mapId).toBe('sector_zero');
    expect(welcome!.assignedExtractions.length).toBeGreaterThan(0);
  });

  it('rejects a join without any credentials when demo auth is required', async () => {
    const strict = new Client(ENDPOINT);
    await expect(
      strict.joinOrCreate('raid', { mapId: 'sector_zero', demoUserId: '' }),
    ).rejects.toBeTruthy();
  });

  it('starts the match and spawns the world', async () => {
    await waitFor(
      () => room.state.phase === RaidPhase.Active || room.state.phase === RaidPhase.FinalPhase,
      'match to become active',
    );
    expect(room.state.containers.size).toBeGreaterThan(50);
    expect(room.state.enemies.size).toBeGreaterThan(0);
    expect(room.state.players.size).toBe(1);
  });

  it('moves the player under server authority', async () => {
    const me = () => room.state.players.get(room.sessionId) as { x: number; z: number };
    const startX = me().x;
    const startZ = me().z;

    for (let seq = 1; seq <= 40; seq += 1) {
      room.send(ClientMessage.Input, {
        seq,
        dt: 1 / 30,
        forward: 1,
        right: 0,
        yaw: 0,
        pitch: 0,
        sprint: true,
        crouch: false,
        ads: false,
        px: startX,
        py: 0,
        pz: startZ,
      });
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    await waitFor(
      () => distance2D({ x: startX, z: startZ }, me()) > 1,
      'player to move',
    );
    expect(distance2D({ x: startX, z: startZ }, me())).toBeGreaterThan(1);
  });

  it('refuses to move a player faster than the movement rules allow', async () => {
    const me = () => room.state.players.get(room.sessionId) as { x: number; z: number };
    const before = { x: me().x, z: me().z };

    // Claim a 500 m jump in a single frame.
    room.send(ClientMessage.Input, {
      seq: 5_000,
      dt: 1 / 30,
      forward: 1,
      right: 0,
      yaw: 0,
      pitch: 0,
      sprint: true,
      crouch: false,
      ads: false,
      px: before.x + 500,
      py: 0,
      pz: before.z + 500,
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(distance2D(before, me())).toBeLessThan(2);
  });

  it('walks to a container, opens it and takes loot', async () => {
    const containers = [...room.state.containers.entries()] as [
      string,
      { x: number; z: number; opened: boolean },
    ][];
    const me = () => room.state.players.get(room.sessionId) as { x: number; z: number };

    const nearest = containers
      .map(([id, container]) => ({
        id,
        container,
        distance: distance2D(me(), container),
      }))
      .sort((a, b) => a.distance - b.distance)[0]!;

    // Debug teleport is a development-only tool; it is how the test gets into
    // interaction range without simulating a two-minute walk.
    room.send(ClientMessage.DebugCommand, {
      command: 'teleport',
      x: nearest.container.x,
      z: nearest.container.z,
    });
    await waitFor(() => distance2D(me(), nearest.container) < 2, 'teleport to container');

    room.send(ClientMessage.Interact, { containerId: nearest.id });
    await waitFor(() => openedContainer !== null, 'container to open');
    expect(openedContainer!.containerId).toBe(nearest.id);

    if (openedContainer!.items.length > 0) {
      const item = openedContainer!.items[0]!;
      room.send(ClientMessage.Pickup, {
        containerId: nearest.id,
        worldItemId: item.worldItemId,
        container: 'backpack',
      });
      await waitFor(
        () => (room.state.containers.get(nearest.id) as { empty: boolean }).empty ||
          openedContainer!.items.length > 1,
        'loot to be taken',
      );
    }
    expect((room.state.containers.get(nearest.id) as { opened: boolean }).opened).toBe(true);
  });

  it('rejects an interact from out of range', async () => {
    const rejections: string[] = [];
    room.onMessage(ServerMessage.ActionRejected, (payload: { action: string; reason: string }) => {
      rejections.push(payload.reason);
    });
    const far = [...room.state.containers.entries()]
      .map(([id, container]) => ({ id, container: container as { x: number; z: number } }))
      .sort(
        (a, b) =>
          distance2D(room.state.players.get(room.sessionId) as { x: number; z: number }, b.container) -
          distance2D(room.state.players.get(room.sessionId) as { x: number; z: number }, a.container),
      )[0]!;

    room.send(ClientMessage.Interact, { containerId: far.id });
    await waitFor(() => rejections.includes('out_of_range'), 'out-of-range rejection');
    expect(rejections).toContain('out_of_range');
  });

  it('fires a weapon and consumes ammunition server side', async () => {
    const me = () => room.state.players.get(room.sessionId) as { ammoInMag: number };
    const before = me().ammoInMag;
    expect(before).toBeGreaterThan(0);

    room.send(ClientMessage.Fire, { seq: 1, yaw: 0, pitch: 0, shotId: 1 });
    await waitFor(() => me().ammoInMag < before, 'ammo to be consumed');
    expect(me().ammoInMag).toBe(before - 1);
  });

  it('ignores shots that break the weapon fire rate', async () => {
    const me = () => room.state.players.get(room.sessionId) as { ammoInMag: number };
    const before = me().ammoInMag;
    for (let i = 0; i < 12; i += 1) {
      room.send(ClientMessage.Fire, { seq: 10 + i, yaw: 0, pitch: 0, shotId: 10 + i });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    // A 400 RPM pistol cannot fire 12 rounds in half a second.
    expect(before - me().ammoInMag).toBeLessThan(5);
  });

  it('extracts and writes the raid to persistent storage', async () => {
    const pointId = welcome!.assignedExtractions[0]!;
    const point = SECTOR_ZERO.extractions.find((entry) => entry.id === pointId)!;
    const me = () =>
      room.state.players.get(room.sessionId) as { x: number; z: number; raidState: string };

    room.send(ClientMessage.DebugCommand, {
      command: 'teleport',
      x: point.position.x,
      z: point.position.z,
    });
    await waitFor(() => distance2D(me(), point.position) < point.radius, 'teleport to extraction');

    room.send(ClientMessage.StartExtraction, { extractionPointId: pointId });
    await waitFor(() => me().raidState === PlayerRaidState.Extracted, 'extraction to complete');
    await waitFor(() => summary !== null, 'raid summary');

    expect(summary!.result).toBe('extracted');
    expect(summary!.xpEarned).toBeGreaterThan(0);

    // The raid must be written to the database, with the loot in the stash.
    const raw = JSON.parse(await readFile(dbPath, 'utf8')) as {
      profiles: Record<string, { xp: number }>;
      inventory: { playerId: string; container: string; itemId: string }[];
      raids: Record<string, { playerId: string; result: string }>;
      stats: Record<string, { raids: number; successfulExtractions: number }>;
    };

    expect(raw.profiles[userId]!.xp).toBeGreaterThan(0);
    expect(raw.stats[userId]!.raids).toBe(1);
    expect(raw.stats[userId]!.successfulExtractions).toBe(1);
    const finished = Object.values(raw.raids).filter((raid) => raid.playerId === userId);
    expect(finished.some((raid) => raid.result === 'extracted')).toBe(true);
    // The pistol the player deployed with comes home on a successful extract.
    expect(
      raw.inventory.some((row) => row.playerId === userId && row.container === 'stash'),
    ).toBe(true);

    await room.leave(true);
  });
});
