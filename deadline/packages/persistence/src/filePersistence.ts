import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_GAME_CONFIG,
  getAnyMission,
  getItem,
  levelForXp,
  sellPrice,
  type RaidResult,
} from '@deadline/shared';
import type {
  DeployManifest,
  FinalizeRaidPayload,
  FinalizeRaidResult,
  InventoryContainer,
  InventoryRow,
  LeaderboardEntry,
  LoadoutPatch,
  LoadoutRecord,
  MarketResult,
  MissionRow,
  Persistence,
  ProfileRecord,
  RaidHistoryRecord,
  StatsRecord,
  SuspiciousEventRecord,
} from './types.js';

interface FileDatabase {
  version: number;
  profiles: Record<string, ProfileRecord>;
  stats: Record<string, StatsRecord>;
  inventory: InventoryRow[];
  loadouts: Record<string, LoadoutRecord>;
  raids: Record<string, RaidHistoryRecord & { playerId: string }>;
  missions: Record<string, MissionRow & { playerId: string }>;
  dailyPicks: Record<string, string[]>;
  suspicious: (SuspiciousEventRecord & { at: string })[];
}

function emptyDatabase(): FileDatabase {
  return {
    version: 1,
    profiles: {},
    stats: {},
    inventory: [],
    loadouts: {},
    raids: {},
    missions: {},
    dailyPicks: {},
    suspicious: [],
  };
}

/**
 * File-backed persistence for local development and demo mode.
 *
 * It implements the same port as the Supabase adapter, writing a single JSON
 * document that both the web app and the game server open, so a raid played
 * without a Supabase project still updates the stash, stats and missions you
 * see in the menus. Writes are serialised through an in-process queue and
 * committed atomically (write temp + rename).
 *
 * It is explicitly NOT a production store: no concurrency across machines, no
 * row-level security, no migrations.
 */
export class FilePersistence implements Persistence {
  readonly kind = 'file' as const;
  private readonly path: string;
  private cache: FileDatabase | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  private async load(): Promise<FileDatabase> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as FileDatabase;
      this.cache = { ...emptyDatabase(), ...parsed };
    } catch {
      this.cache = emptyDatabase();
    }
    return this.cache;
  }

  private async persist(db: FileDatabase): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
    await rename(temp, this.path);
  }

  /** Runs `mutate` against the database with exclusive access, then commits. */
  private transaction<T>(mutate: (db: FileDatabase) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      // Re-read from disk so a sibling process' writes are not clobbered.
      this.cache = null;
      const db = await this.load();
      const result = await mutate(db);
      await this.persist(db);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read<T>(project: (db: FileDatabase) => T): Promise<T> {
    this.cache = null;
    return project(await this.load());
  }

  // ------------------------------------------------------------- profiles

  async ensureProfile(userId: string, username: string): Promise<ProfileRecord> {
    return this.transaction((db) => {
      const existing = db.profiles[userId];
      if (existing) return existing;
      const profile: ProfileRecord = {
        id: userId,
        username,
        level: 1,
        xp: 0,
        credits: DEFAULT_GAME_CONFIG.startingCredits,
        tutorialDone: false,
        createdAt: new Date().toISOString(),
      };
      db.profiles[userId] = profile;
      db.stats[userId] = {
        playerId: userId,
        raids: 0,
        successfulExtractions: 0,
        deaths: 0,
        playerKills: 0,
        aiKills: 0,
        lootExtractedValue: 0,
        damageDealt: 0,
        playtimeSeconds: 0,
      };
      db.loadouts[userId] = {
        id: randomUUID(),
        playerId: userId,
        name: 'Standard Issue',
        primaryWeaponId: 'pm9',
        secondaryWeaponId: null,
        armorItemId: null,
        perkIds: ['runner'],
      };
      // Starter kit so a brand-new operator can deploy immediately.
      for (const [itemId, quantity] of [
        ['pm9', 1],
        ['ammo_light', 3],
        ['bandage', 3],
        ['armor_light_vest', 1],
      ] as const) {
        db.inventory.push(makeRow(userId, 'stash', itemId, quantity, db.inventory.length));
      }
      return profile;
    });
  }

  async getProfile(userId: string): Promise<ProfileRecord | null> {
    return this.read((db) => db.profiles[userId] ?? null);
  }

  async setTutorialDone(userId: string): Promise<void> {
    await this.transaction((db) => {
      const profile = db.profiles[userId];
      if (profile) profile.tutorialDone = true;
    });
  }

  async getStats(userId: string): Promise<StatsRecord> {
    return this.read(
      (db) =>
        db.stats[userId] ?? {
          playerId: userId,
          raids: 0,
          successfulExtractions: 0,
          deaths: 0,
          playerKills: 0,
          aiKills: 0,
          lootExtractedValue: 0,
          damageDealt: 0,
          playtimeSeconds: 0,
        },
    );
  }

  // ------------------------------------------------------------ inventory

  async listInventory(userId: string, container?: InventoryContainer): Promise<InventoryRow[]> {
    return this.read((db) =>
      db.inventory.filter(
        (row) => row.playerId === userId && (container ? row.container === container : true),
      ),
    );
  }

  async moveInventoryContainer(
    userId: string,
    entryId: string,
    container: InventoryContainer,
  ): Promise<void> {
    await this.transaction((db) => {
      const row = db.inventory.find((entry) => entry.id === entryId && entry.playerId === userId);
      if (!row) throw new Error('entry_not_found');
      row.container = container;
    });
  }

  // ------------------------------------------------------------- loadouts

  async getActiveLoadout(userId: string): Promise<LoadoutRecord | null> {
    return this.read((db) => db.loadouts[userId] ?? null);
  }

  async saveLoadout(userId: string, patch: LoadoutPatch): Promise<LoadoutRecord> {
    return this.transaction((db) => {
      const current: LoadoutRecord = db.loadouts[userId] ?? {
        id: randomUUID(),
        playerId: userId,
        name: 'Default',
        primaryWeaponId: null,
        secondaryWeaponId: null,
        armorItemId: null,
        perkIds: [],
      };
      const next: LoadoutRecord = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.primaryWeaponId !== undefined ? { primaryWeaponId: patch.primaryWeaponId } : {}),
        ...(patch.secondaryWeaponId !== undefined
          ? { secondaryWeaponId: patch.secondaryWeaponId }
          : {}),
        ...(patch.armorItemId !== undefined ? { armorItemId: patch.armorItemId } : {}),
        ...(patch.perkIds !== undefined
          ? { perkIds: patch.perkIds.slice(0, DEFAULT_GAME_CONFIG.perkSlots) }
          : {}),
      };
      db.loadouts[userId] = next;
      return next;
    });
  }

  async deployLoadout(userId: string, _loadoutId: string | null): Promise<DeployManifest> {
    return this.transaction((db) => {
      const loadout = db.loadouts[userId];
      const manifest: DeployManifest = {
        loadoutId: loadout?.id ?? null,
        primaryWeaponId: null,
        secondaryWeaponId: null,
        armorItemId: null,
        perkIds: loadout?.perkIds ?? [],
        backpack: [],
        secure: [],
      };
      if (!loadout) return manifest;

      // Equipped gear leaves the stash: that is what puts it at risk.
      const takeOne = (itemId: string | null): string | null => {
        if (!itemId) return null;
        const index = db.inventory.findIndex(
          (row) => row.playerId === userId && row.container === 'stash' && row.itemId === itemId,
        );
        if (index === -1) return null;
        const row = db.inventory[index]!;
        row.quantity -= 1;
        if (row.quantity <= 0) db.inventory.splice(index, 1);
        return itemId;
      };

      manifest.primaryWeaponId = takeOne(loadout.primaryWeaponId);
      manifest.secondaryWeaponId = takeOne(loadout.secondaryWeaponId);
      manifest.armorItemId = takeOne(loadout.armorItemId);

      // Items the player pre-packed into the backpack / secure container.
      const packed = db.inventory.filter(
        (row) =>
          row.playerId === userId &&
          (row.container === 'loadout_backpack' || row.container === 'loadout_secure'),
      );
      for (const row of packed) {
        const entry = {
          itemId: row.itemId,
          quantity: row.quantity,
          x: row.gridX,
          y: row.gridY,
          rotated: row.rotated,
        };
        if (row.container === 'loadout_secure') manifest.secure.push(entry);
        else manifest.backpack.push(entry);
      }
      db.inventory = db.inventory.filter((row) => !packed.includes(row));

      // Clear anything the player no longer owned so the UI stays honest.
      loadout.primaryWeaponId = manifest.primaryWeaponId;
      loadout.secondaryWeaponId = manifest.secondaryWeaponId;
      loadout.armorItemId = manifest.armorItemId;
      return manifest;
    });
  }

  // ----------------------------------------------------------------- raids

  async startRaid(userId: string, roomId: string, mapId: string): Promise<string> {
    return this.transaction((db) => {
      const id = randomUUID();
      db.raids[id] = {
        id,
        playerId: userId,
        roomId,
        mapId,
        startedAt: new Date().toISOString(),
        endedAt: null,
        result: null,
        survivalSeconds: 0,
        playerKills: 0,
        aiKills: 0,
        lootValue: 0,
        xpEarned: 0,
      };
      return id;
    });
  }

  async finalizeRaid(
    userId: string,
    raidId: string,
    payload: FinalizeRaidPayload,
  ): Promise<FinalizeRaidResult> {
    return this.transaction((db) => {
      const profile = db.profiles[userId];
      if (!profile) throw new Error('unknown_player');
      const extracted = payload.result === 'extracted';
      const levelBefore = profile.level;

      let xpEarned = Math.max(0, Math.round(payload.xpEarned));
      let creditsEarned = 0;

      for (const patch of payload.missions) {
        const definition = getAnyMission(patch.missionId);
        if (!definition) continue;
        const key = missionKey(userId, patch.missionId, patch.resetKey);
        const existing = db.missions[key];
        const merged: MissionRow & { playerId: string } = {
          id: existing?.id ?? randomUUID(),
          playerId: userId,
          missionId: patch.missionId,
          progress: Math.max(existing?.progress ?? 0, patch.progress),
          completed: (existing?.completed ?? false) || patch.completed,
          claimedAt: existing?.claimedAt ?? null,
          daily: patch.daily,
          resetKey: patch.resetKey,
        };
        const newlyCompleted = merged.completed && !(existing?.completed ?? false);
        db.missions[key] = merged;
        if (newlyCompleted) {
          xpEarned += definition.xpReward;
          creditsEarned += definition.creditReward;
        }
      }

      profile.xp += xpEarned;
      profile.credits += creditsEarned;
      profile.level = levelForXp(profile.xp);

      const raid = db.raids[raidId];
      if (raid) {
        raid.endedAt = new Date().toISOString();
        raid.result = payload.result as RaidResult;
        raid.survivalSeconds = payload.survivalSeconds;
        raid.playerKills = payload.playerKills;
        raid.aiKills = payload.aiKills;
        raid.lootValue = extracted ? payload.lootValue : 0;
        raid.xpEarned = xpEarned;
      }

      for (const stack of payload.stash) {
        if (!getItem(stack.itemId)) continue;
        db.inventory.push(
          makeRow(userId, 'stash', stack.itemId, stack.quantity, db.inventory.length, {
            ammoInMag: stack.ammoInMag ?? null,
            durability: stack.durability ?? null,
          }),
        );
      }

      const stats = db.stats[userId];
      if (stats) {
        stats.raids += 1;
        stats.successfulExtractions += extracted ? 1 : 0;
        stats.deaths += payload.result === 'kia' ? 1 : 0;
        stats.playerKills += payload.playerKills;
        stats.aiKills += payload.aiKills;
        stats.lootExtractedValue += extracted ? payload.lootValue : 0;
        stats.damageDealt += Math.round(payload.damageDealt);
        stats.playtimeSeconds += payload.survivalSeconds;
      }

      return {
        raidId,
        xpEarned,
        creditsEarned,
        levelBefore,
        levelAfter: profile.level,
        xpTotal: profile.xp,
      };
    });
  }

  async listRaidHistory(userId: string, limit: number): Promise<RaidHistoryRecord[]> {
    return this.read((db) =>
      Object.values(db.raids)
        .filter((raid) => raid.playerId === userId && raid.endedAt !== null)
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
        .slice(0, limit),
    );
  }

  // ---------------------------------------------------------------- market

  async marketBuy(userId: string, itemId: string, quantity: number): Promise<MarketResult> {
    return this.transaction((db) => {
      const profile = db.profiles[userId];
      const def = getItem(itemId);
      if (!profile) return { ok: false, credits: 0, totalPrice: 0, reason: 'unknown_player' };
      if (!def) return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'unknown_item' };
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'invalid_quantity' };
      }
      if (!def.tradable) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'not_tradable' };
      }
      const totalPrice = def.value * quantity;
      if (totalPrice > profile.credits) {
        return { ok: false, credits: profile.credits, totalPrice, reason: 'insufficient_credits' };
      }
      profile.credits -= totalPrice;
      db.inventory.push(makeRow(userId, 'stash', itemId, quantity, db.inventory.length));
      return { ok: true, credits: profile.credits, totalPrice };
    });
  }

  async marketSell(userId: string, entryId: string, quantity: number): Promise<MarketResult> {
    return this.transaction((db) => {
      const profile = db.profiles[userId];
      if (!profile) return { ok: false, credits: 0, totalPrice: 0, reason: 'unknown_player' };
      const index = db.inventory.findIndex(
        (row) => row.id === entryId && row.playerId === userId && row.container === 'stash',
      );
      if (index === -1) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'entry_not_found' };
      }
      const row = db.inventory[index]!;
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > row.quantity) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'invalid_quantity' };
      }
      const def = getItem(row.itemId);
      if (!def?.tradable) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'not_tradable' };
      }
      const totalPrice = sellPrice(row.itemId, quantity);
      row.quantity -= quantity;
      if (row.quantity <= 0) db.inventory.splice(index, 1);
      profile.credits += totalPrice;
      return { ok: true, credits: profile.credits, totalPrice };
    });
  }

  // -------------------------------------------------------------- missions

  async listMissions(userId: string): Promise<MissionRow[]> {
    return this.read((db) =>
      Object.values(db.missions).filter((row) => row.playerId === userId),
    );
  }

  async ensureDailyMissions(
    userId: string,
    resetKey: string,
    poolIds: string[],
  ): Promise<MissionRow[]> {
    return this.transaction((db) => {
      let picks = db.dailyPicks[resetKey];
      if (!picks) {
        picks = [...poolIds].sort((a, b) => hash(resetKey + a) - hash(resetKey + b)).slice(0, 3);
        db.dailyPicks[resetKey] = picks;
      }
      const rows: MissionRow[] = [];
      for (const missionId of picks) {
        const key = missionKey(userId, missionId, resetKey);
        const existing = db.missions[key];
        if (existing) {
          rows.push(existing);
          continue;
        }
        const row = {
          id: randomUUID(),
          playerId: userId,
          missionId,
          progress: 0,
          completed: false,
          claimedAt: null,
          daily: true,
          resetKey,
        };
        db.missions[key] = row;
        rows.push(row);
      }
      return rows;
    });
  }

  async claimMission(userId: string, playerMissionId: string): Promise<MarketResult> {
    return this.transaction((db) => {
      const profile = db.profiles[userId];
      if (!profile) return { ok: false, credits: 0, totalPrice: 0, reason: 'unknown_player' };
      const row = Object.values(db.missions).find(
        (mission) => mission.id === playerMissionId && mission.playerId === userId,
      );
      if (!row) return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'mission_not_found' };
      if (!row.completed) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'mission_incomplete' };
      }
      if (row.claimedAt) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'already_claimed' };
      }
      const definition = getAnyMission(row.missionId);
      if (!definition) {
        return { ok: false, credits: profile.credits, totalPrice: 0, reason: 'unknown_mission' };
      }
      row.claimedAt = new Date().toISOString();
      profile.credits += definition.creditReward;
      profile.xp += definition.xpReward;
      profile.level = levelForXp(profile.xp);
      return { ok: true, credits: profile.credits, totalPrice: definition.creditReward };
    });
  }

  // ----------------------------------------------------------- leaderboard

  async leaderboard(
    metric: 'loot' | 'kills' | 'extracts',
    limit: number,
  ): Promise<LeaderboardEntry[]> {
    return this.read((db) => buildLeaderboard(db, metric).slice(0, limit));
  }

  async leaderboardRank(
    userId: string,
    metric: 'loot' | 'kills' | 'extracts',
  ): Promise<number | null> {
    return this.read((db) => {
      const found = buildLeaderboard(db, metric).find((entry) => entry.playerId === userId);
      return found ? found.rank : null;
    });
  }

  async logSuspicious(event: SuspiciousEventRecord): Promise<void> {
    await this.transaction((db) => {
      db.suspicious.push({ ...event, at: new Date().toISOString() });
      if (db.suspicious.length > 500) db.suspicious.splice(0, db.suspicious.length - 500);
    });
  }
}

function buildLeaderboard(
  db: FileDatabase,
  metric: 'loot' | 'kills' | 'extracts',
): LeaderboardEntry[] {
  const weekStart = startOfWeekUTC();
  const totals = new Map<string, { loot: number; kills: number; extracts: number }>();
  for (const raid of Object.values(db.raids)) {
    if (!raid.endedAt || raid.endedAt < weekStart) continue;
    const current = totals.get(raid.playerId) ?? { loot: 0, kills: 0, extracts: 0 };
    current.loot += raid.lootValue;
    current.kills += raid.playerKills;
    current.extracts += raid.result === 'extracted' ? 1 : 0;
    totals.set(raid.playerId, current);
  }
  return [...totals.entries()]
    .map(([playerId, value]) => {
      const profile = db.profiles[playerId];
      return {
        playerId,
        username: profile?.username ?? 'unknown',
        level: profile?.level ?? 1,
        lootExtractedValue: value.loot,
        playerKills: value.kills,
        successfulExtractions: value.extracts,
      };
    })
    .sort((a, b) => {
      const key =
        metric === 'kills'
          ? ('playerKills' as const)
          : metric === 'extracts'
            ? ('successfulExtractions' as const)
            : ('lootExtractedValue' as const);
      return b[key] - a[key] || a.username.localeCompare(b.username);
    })
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

function startOfWeekUTC(): string {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day),
  );
  return monday.toISOString();
}

function missionKey(userId: string, missionId: string, resetKey: string | null): string {
  return `${userId}:${missionId}:${resetKey ?? '-'}`;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRow(
  playerId: string,
  container: InventoryContainer,
  itemId: string,
  quantity: number,
  index: number,
  meta: { ammoInMag?: number | null; durability?: number | null } = {},
): InventoryRow {
  return {
    id: randomUUID(),
    playerId,
    container,
    itemId,
    quantity,
    gridX: index % 10,
    gridY: Math.floor(index / 10) % 10,
    rotated: false,
    ammoInMag: meta.ammoInMag ?? null,
    durability: meta.durability ?? null,
  };
}

/** Default demo database location, shared by the web app and the game server. */
export function defaultDemoDatabasePath(): string {
  const override = process.env['DEMO_DB_PATH'];
  if (override && override.trim() !== '') return override.trim();
  return join(process.cwd(), '..', '..', '.deadline-demo', 'db.json');
}
