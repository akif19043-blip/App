-- DEADLINE — server-side transactional functions
--
-- Everything that moves credits, XP or items lives here so it happens inside a
-- single transaction and can be audited. The client calls the market functions
-- with its own JWT (auth.uid() decides who it is); the game server calls
-- finalize_raid with the service role.

-- --------------------------------------------------------------- XP helpers
-- Mirror of packages/shared/src/progression.ts. Kept in SQL so the database can
-- derive a level without trusting a caller-supplied value.

create or replace function public.xp_for_level(p_level integer)
returns integer
language plpgsql
immutable
as $$
declare
  threshold numeric := 0;
  requirement numeric := 1000;
  i integer;
begin
  if p_level <= 1 then return 0; end if;
  for i in 2..least(p_level, 60) loop
    threshold := threshold + round(requirement / 100) * 100;
    requirement := requirement * 1.48;
  end loop;
  return threshold::integer;
end;
$$;

create or replace function public.level_for_xp(p_xp integer)
returns integer
language plpgsql
immutable
as $$
declare
  lvl integer;
begin
  for lvl in reverse 60..1 loop
    if p_xp >= public.xp_for_level(lvl) then
      return lvl;
    end if;
  end loop;
  return 1;
end;
$$;

-- ------------------------------------------------------------ raid lifecycle

-- Opens a raid record. Called by the game server when a player deploys.
create or replace function public.start_raid(
  p_player_id uuid,
  p_room_id   text,
  p_map_id    text default 'sector_zero'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  raid_id uuid;
begin
  insert into public.raid_history (player_id, room_id, map_id, started_at)
  values (p_player_id, p_room_id, p_map_id, now())
  returning id into raid_id;
  return raid_id;
end;
$$;

/*
  Closes a raid atomically.

  p_payload shape:
  {
    "result": "extracted" | "kia" | "mia",
    "survival_seconds": 421,
    "player_kills": 1,
    "ai_kills": 4,
    "damage_dealt": 640.5,
    "xp_earned": 1520,
    "loot_value": 8200,
    "loot": [{ "item_id": "gold_watch", "quantity": 1, "value": 3100, "extracted": true }],
    "stash": [{ "item_id": "gold_watch", "quantity": 1, "ammo_in_mag": null, "durability": null }],
    "missions": [{ "mission_id": "cleanup", "progress": 5, "completed": true, "daily": false, "reset_key": null }]
  }

  Only rows in "stash" are added to the player's permanent stash, and the game
  server only puts items there when the player actually extracted (plus their
  secure container contents, which survive death).
*/
create or replace function public.finalize_raid(
  p_player_id uuid,
  p_raid_id   uuid,
  p_payload   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result           text := p_payload ->> 'result';
  v_xp               integer := coalesce((p_payload ->> 'xp_earned')::integer, 0);
  v_loot_value       integer := coalesce((p_payload ->> 'loot_value')::integer, 0);
  v_survival         integer := coalesce((p_payload ->> 'survival_seconds')::integer, 0);
  v_player_kills     integer := coalesce((p_payload ->> 'player_kills')::integer, 0);
  v_ai_kills         integer := coalesce((p_payload ->> 'ai_kills')::integer, 0);
  v_damage           numeric := coalesce((p_payload ->> 'damage_dealt')::numeric, 0);
  v_extracted        boolean := v_result = 'extracted';
  v_level_before     integer;
  v_level_after      integer;
  v_credit_reward    integer := 0;
  v_xp_after         integer;
  v_row              jsonb;
  v_next_x           integer := 0;
  v_next_y           integer := 0;
  v_mission          jsonb;
  v_mission_def      record;
begin
  if v_result not in ('extracted', 'kia', 'mia') then
    raise exception 'invalid raid result: %', v_result;
  end if;

  select level into v_level_before from public.profiles where id = p_player_id for update;
  if v_level_before is null then
    raise exception 'unknown player %', p_player_id;
  end if;

  update public.raid_history
     set ended_at = now(),
         result = v_result,
         survival_seconds = v_survival,
         player_kills = v_player_kills,
         ai_kills = v_ai_kills,
         loot_value = case when v_extracted then v_loot_value else 0 end,
         xp_earned = v_xp
   where id = p_raid_id and player_id = p_player_id;

  -- Loot manifest (audit trail: what was carried, and whether it made it out).
  for v_row in select * from jsonb_array_elements(coalesce(p_payload -> 'loot', '[]'::jsonb))
  loop
    if exists (select 1 from public.items where id = v_row ->> 'item_id') then
      insert into public.raid_loot (raid_id, player_id, item_id, quantity, value, extracted)
      values (
        p_raid_id,
        p_player_id,
        v_row ->> 'item_id',
        greatest(1, coalesce((v_row ->> 'quantity')::integer, 1)),
        greatest(0, coalesce((v_row ->> 'value')::integer, 0)),
        coalesce((v_row ->> 'extracted')::boolean, false)
      );
    end if;
  end loop;

  -- Items that survived: written to the stash only now, never mid-raid.
  select coalesce(max(grid_y), -1) + 1 into v_next_y
    from public.player_inventory
   where player_id = p_player_id and container = 'stash';

  for v_row in select * from jsonb_array_elements(coalesce(p_payload -> 'stash', '[]'::jsonb))
  loop
    if exists (select 1 from public.items where id = v_row ->> 'item_id') then
      insert into public.player_inventory (
        player_id, container, item_id, quantity, grid_x, grid_y, rotated, ammo_in_mag, durability
      )
      values (
        p_player_id,
        'stash',
        v_row ->> 'item_id',
        greatest(1, coalesce((v_row ->> 'quantity')::integer, 1)),
        v_next_x,
        v_next_y,
        false,
        nullif(v_row ->> 'ammo_in_mag', '')::integer,
        nullif(v_row ->> 'durability', '')::numeric
      );
      v_next_x := v_next_x + 1;
      if v_next_x >= 10 then
        v_next_x := 0;
        v_next_y := v_next_y + 1;
      end if;
    end if;
  end loop;

  -- Missions: progress rows plus their rewards when they complete.
  for v_mission in select * from jsonb_array_elements(coalesce(p_payload -> 'missions', '[]'::jsonb))
  loop
    select * into v_mission_def from public.missions where id = v_mission ->> 'mission_id';
    if found then
      insert into public.player_missions (player_id, mission_id, progress, completed, daily, reset_key)
      values (
        p_player_id,
        v_mission_def.id,
        greatest(0, coalesce((v_mission ->> 'progress')::integer, 0)),
        coalesce((v_mission ->> 'completed')::boolean, false),
        coalesce((v_mission ->> 'daily')::boolean, false),
        nullif(v_mission ->> 'reset_key', '')
      )
      on conflict (player_id, mission_id, reset_key) do update
        set progress = greatest(public.player_missions.progress, excluded.progress),
            completed = public.player_missions.completed or excluded.completed;

      if coalesce((v_mission ->> 'completed')::boolean, false) then
        v_xp := v_xp + v_mission_def.xp_reward;
        v_credit_reward := v_credit_reward + v_mission_def.credit_reward;
      end if;
    end if;
  end loop;

  update public.profiles
     set xp = xp + greatest(0, v_xp),
         credits = credits + greatest(0, v_credit_reward),
         level = public.level_for_xp(xp + greatest(0, v_xp))
   where id = p_player_id
   returning xp, level into v_xp_after, v_level_after;

  insert into public.player_stats (player_id) values (p_player_id)
    on conflict (player_id) do nothing;

  update public.player_stats
     set raids = raids + 1,
         successful_extractions = successful_extractions + case when v_extracted then 1 else 0 end,
         deaths = deaths + case when v_result = 'kia' then 1 else 0 end,
         player_kills = player_kills + v_player_kills,
         ai_kills = ai_kills + v_ai_kills,
         loot_extracted_value = loot_extracted_value + case when v_extracted then v_loot_value else 0 end,
         damage_dealt = damage_dealt + v_damage::bigint,
         playtime_seconds = playtime_seconds + v_survival
   where player_id = p_player_id;

  perform public.refresh_leaderboard_entry(p_player_id);

  return jsonb_build_object(
    'raid_id', p_raid_id,
    'xp_earned', v_xp,
    'credits_earned', v_credit_reward,
    'level_before', v_level_before,
    'level_after', v_level_after,
    'xp_total', v_xp_after
  );
end;
$$;

-- ------------------------------------------------------------- leaderboard

create or replace function public.current_week_start()
returns date
language sql
stable
as $$
  select (date_trunc('week', now() at time zone 'utc'))::date;
$$;

create or replace function public.refresh_leaderboard_entry(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leaderboard_snapshots (
    week_start, player_id, username, level,
    loot_extracted_value, player_kills, successful_extractions
  )
  select
    public.current_week_start(),
    p.id,
    p.username,
    p.level,
    coalesce(sum(rh.loot_value), 0),
    coalesce(sum(rh.player_kills), 0),
    coalesce(count(*) filter (where rh.result = 'extracted'), 0)
  from public.profiles p
  left join public.raid_history rh
         on rh.player_id = p.id
        and rh.ended_at >= public.current_week_start()
  where p.id = p_player_id
  group by p.id, p.username, p.level
  on conflict (week_start, player_id) do update
    set username = excluded.username,
        level = excluded.level,
        loot_extracted_value = excluded.loot_extracted_value,
        player_kills = excluded.player_kills,
        successful_extractions = excluded.successful_extractions;
end;
$$;

create or replace function public.leaderboard_top(
  p_metric text default 'loot',
  p_limit  integer default 100
)
returns table (
  rank bigint,
  player_id uuid,
  username text,
  level integer,
  loot_extracted_value bigint,
  player_kills integer,
  successful_extractions integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (
      order by case p_metric
        when 'kills'    then ls.player_kills::bigint
        when 'extracts' then ls.successful_extractions::bigint
        else ls.loot_extracted_value
      end desc,
      ls.username asc
    ) as rank,
    ls.player_id, ls.username, ls.level,
    ls.loot_extracted_value, ls.player_kills, ls.successful_extractions
  from public.leaderboard_snapshots ls
  where ls.week_start = public.current_week_start()
  order by rank
  limit greatest(1, least(p_limit, 500));
$$;

create or replace function public.leaderboard_rank_for(p_metric text default 'loot')
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select rank::integer from public.leaderboard_top(p_metric, 500)
   where player_id = auth.uid()
   limit 1;
$$;

-- ---------------------------------------------------------------- market

/*
  Buy from the NPC vendor. Runs as the caller (auth.uid()), inside one
  transaction, and re-derives the price from the catalogue — the client only
  supplies an item id and a quantity, never a price.
*/
create or replace function public.market_buy(p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player  uuid := auth.uid();
  v_item    record;
  v_credits integer;
  v_total   integer;
  v_x       integer := 0;
  v_y       integer := 0;
begin
  if v_player is null then
    raise exception 'not_authenticated';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 99 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if not found then raise exception 'unknown_item'; end if;
  if not v_item.tradable then raise exception 'not_tradable'; end if;

  v_total := v_item.value * p_quantity;

  select credits into v_credits from public.profiles where id = v_player for update;
  if v_credits is null then raise exception 'unknown_player'; end if;
  if v_credits < v_total then raise exception 'insufficient_credits'; end if;

  update public.profiles set credits = credits - v_total where id = v_player
    returning credits into v_credits;

  select coalesce(max(grid_y), -1) + 1 into v_y
    from public.player_inventory where player_id = v_player and container = 'stash';

  insert into public.player_inventory (player_id, container, item_id, quantity, grid_x, grid_y)
  values (v_player, 'stash', p_item_id, p_quantity, v_x, v_y);

  insert into public.market_transactions
    (player_id, item_id, kind, quantity, unit_price, total_price, credits_after)
  values (v_player, p_item_id, 'buy', p_quantity, v_item.value, v_total, v_credits);

  return jsonb_build_object('ok', true, 'credits', v_credits, 'total_price', v_total);
end;
$$;

/*
  Sell a stash stack back to the vendor. The sell ratio and rarity modifier are
  applied here, in the database, so a modified client cannot inflate the payout.
*/
create or replace function public.market_sell(
  p_inventory_id uuid,
  p_quantity     integer,
  p_sell_ratio   numeric default 0.55
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player   uuid := auth.uid();
  v_entry    record;
  v_item     record;
  v_modifier numeric;
  v_unit     integer;
  v_total    integer;
  v_credits  integer;
begin
  if v_player is null then raise exception 'not_authenticated'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  -- The ratio is clamped: a caller cannot pass in a better rate than configured.
  p_sell_ratio := least(greatest(coalesce(p_sell_ratio, 0.55), 0.05), 0.55);

  select * into v_entry from public.player_inventory
   where id = p_inventory_id and player_id = v_player and container = 'stash'
   for update;
  if not found then raise exception 'entry_not_found'; end if;
  if v_entry.quantity < p_quantity then raise exception 'invalid_quantity'; end if;

  select * into v_item from public.items where id = v_entry.item_id;
  if not found then raise exception 'unknown_item'; end if;
  if not v_item.tradable then raise exception 'not_tradable'; end if;

  v_modifier := case v_item.rarity
    when 'common'    then 0.95
    when 'uncommon'  then 1.00
    when 'rare'      then 1.05
    when 'epic'      then 1.10
    when 'legendary' then 1.15
    else 1.00
  end;

  v_unit := round(v_item.value * p_sell_ratio * v_modifier);
  v_total := v_unit * p_quantity;

  if v_entry.quantity = p_quantity then
    delete from public.player_inventory where id = p_inventory_id;
  else
    update public.player_inventory set quantity = quantity - p_quantity where id = p_inventory_id;
  end if;

  update public.profiles set credits = credits + v_total where id = v_player
    returning credits into v_credits;

  insert into public.market_transactions
    (player_id, item_id, kind, quantity, unit_price, total_price, credits_after)
  values (v_player, v_entry.item_id, 'sell', p_quantity, v_unit, v_total, v_credits);

  return jsonb_build_object('ok', true, 'credits', v_credits, 'total_price', v_total);
end;
$$;

-- ------------------------------------------------------------ daily missions

/* Picks (once per UTC day, for everybody) the day's three missions. */
create or replace function public.ensure_daily_missions(p_reset_key text)
returns setof public.daily_missions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.daily_missions where reset_key = p_reset_key;
  if v_count = 0 then
    insert into public.daily_missions (reset_key, slot, mission_id)
    select p_reset_key, (row_number() over ()) - 1, id
      from (
        select id from public.missions
         where daily_pool
         -- Deterministic per day: the same three missions for every player.
         order by md5(p_reset_key || id)
         limit 3
      ) picked
    on conflict do nothing;
  end if;

  return query select * from public.daily_missions where reset_key = p_reset_key order by slot;
end;
$$;

/* Grants the reward for a completed, unclaimed mission. */
create or replace function public.claim_mission(p_player_mission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player  uuid := auth.uid();
  v_row     record;
  v_mission record;
  v_credits integer;
begin
  if v_player is null then raise exception 'not_authenticated'; end if;

  select * into v_row from public.player_missions
   where id = p_player_mission_id and player_id = v_player for update;
  if not found then raise exception 'mission_not_found'; end if;
  if not v_row.completed then raise exception 'mission_incomplete'; end if;
  if v_row.claimed_at is not null then raise exception 'already_claimed'; end if;

  select * into v_mission from public.missions where id = v_row.mission_id;
  if not found then raise exception 'unknown_mission'; end if;

  update public.player_missions set claimed_at = now() where id = p_player_mission_id;

  update public.profiles
     set credits = credits + v_mission.credit_reward,
         xp = xp + v_mission.xp_reward,
         level = public.level_for_xp(xp + v_mission.xp_reward)
   where id = v_player
   returning credits into v_credits;

  return jsonb_build_object(
    'ok', true,
    'credits', v_credits,
    'xp_reward', v_mission.xp_reward,
    'credit_reward', v_mission.credit_reward
  );
end;
$$;

-- Grants: the anon/authenticated roles may only call the player-facing RPCs.
revoke all on function public.finalize_raid(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.start_raid(uuid, text, text) from public, anon, authenticated;
revoke all on function public.refresh_leaderboard_entry(uuid) from public, anon, authenticated;

grant execute on function public.market_buy(text, integer) to authenticated;
grant execute on function public.market_sell(uuid, integer, numeric) to authenticated;
grant execute on function public.claim_mission(uuid) to authenticated;
grant execute on function public.ensure_daily_missions(text) to authenticated, anon;
grant execute on function public.leaderboard_top(text, integer) to authenticated, anon;
grant execute on function public.leaderboard_rank_for(text) to authenticated;
grant execute on function public.xp_for_level(integer) to authenticated, anon;
grant execute on function public.level_for_xp(integer) to authenticated, anon;
grant execute on function public.current_week_start() to authenticated, anon;

-- ---------------------------------------------------------------- deployment

/*
  Takes the player's loadout out of the stash and hands it to the game server.

  This is what makes a raid risky: the gear leaves the permanent stash the
  moment you deploy, and only comes back through finalize_raid if you extract
  (or if it was in the secure container). Called with the service role.
*/
create or replace function public.deploy_loadout(
  p_player_id  uuid,
  p_loadout_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loadout   record;
  v_manifest  jsonb := '[]'::jsonb;
  v_secure    jsonb := '[]'::jsonb;
  v_entry     record;
  v_item_id   text;
  v_taken     uuid;
begin
  if p_loadout_id is null then
    select * into v_loadout from public.player_loadouts
     where player_id = p_player_id and is_active
     order by updated_at desc limit 1;
  else
    select * into v_loadout from public.player_loadouts
     where player_id = p_player_id and id = p_loadout_id;
  end if;

  if not found then
    return jsonb_build_object(
      'primary_weapon_id', null, 'secondary_weapon_id', null, 'armor_item_id', null,
      'perk_ids', '[]'::jsonb, 'backpack', '[]'::jsonb, 'secure', '[]'::jsonb
    );
  end if;

  -- Consume one unit of each equipped item from the stash. An item the player
  -- no longer owns is simply dropped from the loadout rather than duplicated.
  foreach v_item_id in array array_remove(
    array[v_loadout.primary_weapon_id, v_loadout.secondary_weapon_id, v_loadout.armor_item_id],
    null
  )
  loop
    select id into v_taken from public.player_inventory
     where player_id = p_player_id and container = 'stash' and item_id = v_item_id
     order by created_at limit 1 for update skip locked;

    if v_taken is not null then
      update public.player_inventory
         set quantity = quantity - 1
       where id = v_taken;
      delete from public.player_inventory where id = v_taken and quantity <= 0;
    else
      -- Not owned any more: clear it from the loadout so the UI stays honest.
      if v_item_id = v_loadout.primary_weapon_id then
        v_loadout.primary_weapon_id := null;
      elsif v_item_id = v_loadout.secondary_weapon_id then
        v_loadout.secondary_weapon_id := null;
      elsif v_item_id = v_loadout.armor_item_id then
        v_loadout.armor_item_id := null;
      end if;
    end if;
  end loop;

  -- Pre-packed backpack / secure container contents.
  for v_entry in
    select * from public.player_inventory
     where player_id = p_player_id and container in ('loadout_backpack', 'loadout_secure')
  loop
    if v_entry.container = 'loadout_secure' then
      v_secure := v_secure || jsonb_build_object(
        'item_id', v_entry.item_id, 'quantity', v_entry.quantity,
        'x', v_entry.grid_x, 'y', v_entry.grid_y, 'rotated', v_entry.rotated
      );
    else
      v_manifest := v_manifest || jsonb_build_object(
        'item_id', v_entry.item_id, 'quantity', v_entry.quantity,
        'x', v_entry.grid_x, 'y', v_entry.grid_y, 'rotated', v_entry.rotated
      );
    end if;
  end loop;

  delete from public.player_inventory
   where player_id = p_player_id and container in ('loadout_backpack', 'loadout_secure');

  update public.player_loadouts
     set primary_weapon_id = v_loadout.primary_weapon_id,
         secondary_weapon_id = v_loadout.secondary_weapon_id,
         armor_item_id = v_loadout.armor_item_id
   where id = v_loadout.id;

  return jsonb_build_object(
    'loadout_id', v_loadout.id,
    'primary_weapon_id', v_loadout.primary_weapon_id,
    'secondary_weapon_id', v_loadout.secondary_weapon_id,
    'armor_item_id', v_loadout.armor_item_id,
    'perk_ids', to_jsonb(v_loadout.perk_ids),
    'backpack', v_manifest,
    'secure', v_secure
  );
end;
$$;

revoke all on function public.deploy_loadout(uuid, uuid) from public, anon, authenticated;

/* Moves a stash stack into (or out of) the pre-packed loadout containers. */
create or replace function public.set_inventory_container(
  p_inventory_id uuid,
  p_container    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := auth.uid();
begin
  if v_player is null then raise exception 'not_authenticated'; end if;
  if p_container not in ('stash', 'loadout_backpack', 'loadout_secure') then
    raise exception 'invalid_container';
  end if;

  update public.player_inventory
     set container = p_container
   where id = p_inventory_id and player_id = v_player;

  if not found then raise exception 'entry_not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_inventory_container(uuid, text) to authenticated;
