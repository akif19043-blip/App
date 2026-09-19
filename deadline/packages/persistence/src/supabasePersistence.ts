import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_GAME_CONFIG, type RaidResult } from '@deadline/shared';
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

interface ProfileRow {
  id: string;
  username: string;
  level: number;
  xp: number;
  credits: number;
  tutorial_done: boolean;
  created_at: string;
}

interface InventoryDbRow {
  id: string;
  player_id: string;
  container: InventoryContainer;
  item_id: string;
  quantity: number;
  grid_x: number;
  grid_y: number;
  rotated: boolean;
  ammo_in_mag: number | null;
  durability: number | null;
}

interface LoadoutDbRow {
  id: string;
  player_id: string;
  name: string;
  primary_weapon_id: string | null;
  secondary_weapon_id: string | null;
  armor_item_id: string | null;
  perk_ids: string[];
}

/**
 * Supabase-backed persistence.
 *
 * Constructed with either the *user's* client (web app: RLS applies, RPCs see
 * `auth.uid()`) or the *service-role* client (game server: RLS bypassed, may
 * call `deploy_loadout` / `finalize_raid`). Mutating gameplay state always goes
 * through a SQL function so it happens in one transaction.
 */
export class SupabasePersistence implements Persistence {
  readonly kind = 'supabase' as const;
  private readonly client: SupabaseClient;
  private readonly serviceRole: boolean;

  constructor(client: SupabaseClient, options: { serviceRole?: boolean } = {}) {
    this.client = client;
    this.serviceRole = options.serviceRole ?? false;
  }

  private requireServiceRole(operation: string): void {
    if (!this.serviceRole) {
      throw new Error(`${operation} requires the service-role client`);
    }
  }

  async ensureProfile(userId: string, username: string): Promise<ProfileRecord> {
    const existing = await this.getProfile(userId);
    if (existing) return existing;

    // The auth trigger normally creates this row; this covers service-role
    // bootstrapping and any row that predates the trigger.
    const { data, error } = await this.client
      .from('profiles')
      .upsert(
        { id: userId, username, credits: DEFAULT_GAME_CONFIG.startingCredits },
        { onConflict: 'id' },
      )
      .select()
      .single<ProfileRow>();
    if (error) throw new Error(`ensureProfile failed: ${error.message}`);
    await this.client.from('player_stats').upsert({ player_id: userId }, { onConflict: 'player_id' });
    return mapProfile(data);
  }

  async getProfile(userId: string): Promise<ProfileRecord | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle<ProfileRow>();
    if (error) throw new Error(`getProfile failed: ${error.message}`);
    return data ? mapProfile(data) : null;
  }

  async setTutorialDone(userId: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ tutorial_done: true })
      .eq('id', userId);
    if (error) throw new Error(`setTutorialDone failed: ${error.message}`);
  }

  async getStats(userId: string): Promise<StatsRecord> {
    const { data, error } = await this.client
      .from('player_stats')
      .select('*')
      .eq('player_id', userId)
      .maybeSingle();
    if (error) throw new Error(`getStats failed: ${error.message}`);
    const row = (data ?? {}) as Record<string, number>;
    return {
      playerId: userId,
      raids: row['raids'] ?? 0,
      successfulExtractions: row['successful_extractions'] ?? 0,
      deaths: row['deaths'] ?? 0,
      playerKills: row['player_kills'] ?? 0,
      aiKills: row['ai_kills'] ?? 0,
      lootExtractedValue: row['loot_extracted_value'] ?? 0,
      damageDealt: row['damage_dealt'] ?? 0,
      playtimeSeconds: row['playtime_seconds'] ?? 0,
    };
  }

  async listInventory(userId: string, container?: InventoryContainer): Promise<InventoryRow[]> {
    let query = this.client.from('player_inventory').select('*').eq('player_id', userId);
    if (container) query = query.eq('container', container);
    const { data, error } = await query;
    if (error) throw new Error(`listInventory failed: ${error.message}`);
    return ((data ?? []) as InventoryDbRow[]).map(mapInventory);
  }

  async moveInventoryContainer(
    _userId: string,
    entryId: string,
    container: InventoryContainer,
  ): Promise<void> {
    const { error } = await this.client.rpc('set_inventory_container', {
      p_inventory_id: entryId,
      p_container: container,
    });
    if (error) throw new Error(error.message);
  }

  async getActiveLoadout(userId: string): Promise<LoadoutRecord | null> {
    const { data, error } = await this.client
      .from('player_loadouts')
      .select('*')
      .eq('player_id', userId)
      .eq('is_active', true)
      .maybeSingle<LoadoutDbRow>();
    if (error) throw new Error(`getActiveLoadout failed: ${error.message}`);
    return data ? mapLoadout(data) : null;
  }

  async saveLoadout(userId: string, patch: LoadoutPatch): Promise<LoadoutRecord> {
    const existing = await this.getActiveLoadout(userId);
    const payload = {
      player_id: userId,
      name: patch.name ?? existing?.name ?? 'Default',
      primary_weapon_id:
        patch.primaryWeaponId !== undefined ? patch.primaryWeaponId : (existing?.primaryWeaponId ?? null),
      secondary_weapon_id:
        patch.secondaryWeaponId !== undefined
          ? patch.secondaryWeaponId
          : (existing?.secondaryWeaponId ?? null),
      armor_item_id:
        patch.armorItemId !== undefined ? patch.armorItemId : (existing?.armorItemId ?? null),
      perk_ids: (patch.perkIds ?? existing?.perkIds ?? []).slice(0, DEFAULT_GAME_CONFIG.perkSlots),
      is_active: true,
    };
    const query = existing
      ? this.client.from('player_loadouts').update(payload).eq('id', existing.id)
      : this.client.from('player_loadouts').insert(payload);
    const { data, error } = await query.select().single<LoadoutDbRow>();
    if (error) throw new Error(`saveLoadout failed: ${error.message}`);
    return mapLoadout(data);
  }

  async deployLoadout(userId: string, loadoutId: string | null): Promise<DeployManifest> {
    this.requireServiceRole('deployLoadout');
    const { data, error } = await this.client.rpc('deploy_loadout', {
      p_player_id: userId,
      p_loadout_id: loadoutId,
    });
    if (error) throw new Error(`deployLoadout failed: ${error.message}`);
    const row = (data ?? {}) as Record<string, unknown>;
    const mapEntries = (value: unknown): DeployManifest['backpack'] =>
      Array.isArray(value)
        ? value.map((entry) => {
            const item = entry as Record<string, unknown>;
            return {
              itemId: String(item['item_id']),
              quantity: Number(item['quantity'] ?? 1),
              x: Number(item['x'] ?? 0),
              y: Number(item['y'] ?? 0),
              rotated: Boolean(item['rotated']),
            };
          })
        : [];
    return {
      loadoutId: (row['loadout_id'] as string | null) ?? null,
      primaryWeaponId: (row['primary_weapon_id'] as string | null) ?? null,
      secondaryWeaponId: (row['secondary_weapon_id'] as string | null) ?? null,
      armorItemId: (row['armor_item_id'] as string | null) ?? null,
      perkIds: Array.isArray(row['perk_ids']) ? (row['perk_ids'] as string[]) : [],
      backpack: mapEntries(row['backpack']),
      secure: mapEntries(row['secure']),
    };
  }

  async startRaid(userId: string, roomId: string, mapId: string): Promise<string> {
    this.requireServiceRole('startRaid');
    const { data, error } = await this.client.rpc('start_raid', {
      p_player_id: userId,
      p_room_id: roomId,
      p_map_id: mapId,
    });
    if (error) throw new Error(`startRaid failed: ${error.message}`);
    return String(data);
  }

  async finalizeRaid(
    userId: string,
    raidId: string,
    payload: FinalizeRaidPayload,
  ): Promise<FinalizeRaidResult> {
    this.requireServiceRole('finalizeRaid');
    const { data, error } = await this.client.rpc('finalize_raid', {
      p_player_id: userId,
      p_raid_id: raidId,
      p_payload: {
        result: payload.result,
        survival_seconds: payload.survivalSeconds,
        player_kills: payload.playerKills,
        ai_kills: payload.aiKills,
        damage_dealt: payload.damageDealt,
        xp_earned: payload.xpEarned,
        loot_value: payload.lootValue,
        loot: payload.loot.map((line) => ({
          item_id: line.itemId,
          quantity: line.quantity,
          value: line.value,
          extracted: line.extracted,
        })),
        stash: payload.stash.map((stack) => ({
          item_id: stack.itemId,
          quantity: stack.quantity,
          ammo_in_mag: stack.ammoInMag ?? null,
          durability: stack.durability ?? null,
        })),
        missions: payload.missions.map((mission) => ({
          mission_id: mission.missionId,
          progress: mission.progress,
          completed: mission.completed,
          daily: mission.daily,
          reset_key: mission.resetKey,
        })),
      },
    });
    if (error) throw new Error(`finalizeRaid failed: ${error.message}`);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      raidId,
      xpEarned: Number(row['xp_earned'] ?? payload.xpEarned),
      creditsEarned: Number(row['credits_earned'] ?? 0),
      levelBefore: Number(row['level_before'] ?? 1),
      levelAfter: Number(row['level_after'] ?? 1),
      xpTotal: Number(row['xp_total'] ?? 0),
    };
  }

  async listRaidHistory(userId: string, limit: number): Promise<RaidHistoryRecord[]> {
    const { data, error } = await this.client
      .from('raid_history')
      .select('*')
      .eq('player_id', userId)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listRaidHistory failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row['id']),
      roomId: String(row['room_id']),
      mapId: String(row['map_id']),
      startedAt: String(row['started_at']),
      endedAt: (row['ended_at'] as string | null) ?? null,
      result: (row['result'] as RaidResult | null) ?? null,
      survivalSeconds: Number(row['survival_seconds'] ?? 0),
      playerKills: Number(row['player_kills'] ?? 0),
      aiKills: Number(row['ai_kills'] ?? 0),
      lootValue: Number(row['loot_value'] ?? 0),
      xpEarned: Number(row['xp_earned'] ?? 0),
    }));
  }

  async marketBuy(_userId: string, itemId: string, quantity: number): Promise<MarketResult> {
    const { data, error } = await this.client.rpc('market_buy', {
      p_item_id: itemId,
      p_quantity: quantity,
    });
    if (error) return { ok: false, credits: 0, totalPrice: 0, reason: error.message };
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      credits: Number(row['credits'] ?? 0),
      totalPrice: Number(row['total_price'] ?? 0),
    };
  }

  async marketSell(_userId: string, entryId: string, quantity: number): Promise<MarketResult> {
    const { data, error } = await this.client.rpc('market_sell', {
      p_inventory_id: entryId,
      p_quantity: quantity,
      p_sell_ratio: DEFAULT_GAME_CONFIG.vendorSellRatio,
    });
    if (error) return { ok: false, credits: 0, totalPrice: 0, reason: error.message };
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      credits: Number(row['credits'] ?? 0),
      totalPrice: Number(row['total_price'] ?? 0),
    };
  }

  async listMissions(userId: string): Promise<MissionRow[]> {
    const { data, error } = await this.client
      .from('player_missions')
      .select('*')
      .eq('player_id', userId);
    if (error) throw new Error(`listMissions failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapMission);
  }

  async ensureDailyMissions(
    userId: string,
    resetKey: string,
    _poolIds: string[],
  ): Promise<MissionRow[]> {
    const { data, error } = await this.client.rpc('ensure_daily_missions', {
      p_reset_key: resetKey,
    });
    if (error) throw new Error(`ensureDailyMissions failed: ${error.message}`);
    const picks = ((data ?? []) as Record<string, unknown>[]).map((row) => String(row['mission_id']));
    if (picks.length > 0) {
      const rows = picks.map((missionId) => ({
        player_id: userId,
        mission_id: missionId,
        daily: true,
        reset_key: resetKey,
      }));
      await this.client
        .from('player_missions')
        .upsert(rows, { onConflict: 'player_id,mission_id,reset_key', ignoreDuplicates: true });
    }
    const { data: mine, error: mineError } = await this.client
      .from('player_missions')
      .select('*')
      .eq('player_id', userId)
      .eq('reset_key', resetKey);
    if (mineError) throw new Error(`ensureDailyMissions failed: ${mineError.message}`);
    return ((mine ?? []) as Record<string, unknown>[]).map(mapMission);
  }

  async claimMission(_userId: string, playerMissionId: string): Promise<MarketResult> {
    const { data, error } = await this.client.rpc('claim_mission', {
      p_player_mission_id: playerMissionId,
    });
    if (error) return { ok: false, credits: 0, totalPrice: 0, reason: error.message };
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      credits: Number(row['credits'] ?? 0),
      totalPrice: Number(row['credit_reward'] ?? 0),
    };
  }

  async leaderboard(
    metric: 'loot' | 'kills' | 'extracts',
    limit: number,
  ): Promise<LeaderboardEntry[]> {
    const { data, error } = await this.client.rpc('leaderboard_top', {
      p_metric: metric,
      p_limit: limit,
    });
    if (error) throw new Error(`leaderboard failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      rank: Number(row['rank'] ?? 0),
      playerId: String(row['player_id']),
      username: String(row['username']),
      level: Number(row['level'] ?? 1),
      lootExtractedValue: Number(row['loot_extracted_value'] ?? 0),
      playerKills: Number(row['player_kills'] ?? 0),
      successfulExtractions: Number(row['successful_extractions'] ?? 0),
    }));
  }

  async leaderboardRank(
    _userId: string,
    metric: 'loot' | 'kills' | 'extracts',
  ): Promise<number | null> {
    const { data, error } = await this.client.rpc('leaderboard_rank_for', { p_metric: metric });
    if (error) return null;
    return data === null || data === undefined ? null : Number(data);
  }

  async logSuspicious(event: SuspiciousEventRecord): Promise<void> {
    await this.client.from('suspicious_events').insert({
      player_id: event.playerId,
      room_id: event.roomId,
      kind: event.kind,
      detail: event.detail,
    });
  }
}

function mapProfile(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    username: row.username,
    level: row.level,
    xp: row.xp,
    credits: row.credits,
    tutorialDone: row.tutorial_done,
    createdAt: row.created_at,
  };
}

function mapInventory(row: InventoryDbRow): InventoryRow {
  return {
    id: row.id,
    playerId: row.player_id,
    container: row.container,
    itemId: row.item_id,
    quantity: row.quantity,
    gridX: row.grid_x,
    gridY: row.grid_y,
    rotated: row.rotated,
    ammoInMag: row.ammo_in_mag,
    durability: row.durability,
  };
}

function mapLoadout(row: LoadoutDbRow): LoadoutRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.name,
    primaryWeaponId: row.primary_weapon_id,
    secondaryWeaponId: row.secondary_weapon_id,
    armorItemId: row.armor_item_id,
    perkIds: row.perk_ids ?? [],
  };
}

function mapMission(row: Record<string, unknown>): MissionRow {
  return {
    id: String(row['id']),
    missionId: String(row['mission_id']),
    progress: Number(row['progress'] ?? 0),
    completed: Boolean(row['completed']),
    claimedAt: (row['claimed_at'] as string | null) ?? null,
    daily: Boolean(row['daily']),
    resetKey: (row['reset_key'] as string | null) ?? null,
  };
}
