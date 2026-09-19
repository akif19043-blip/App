-- DEADLINE — core schema
-- All gameplay-critical writes happen either through SECURITY DEFINER functions
-- (validated server side) or through the game server's service-role key.
-- Row Level Security (migration 20250101000100) makes sure a player can only
-- ever read/modify their own rows and can never set their own credits or XP.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- catalogues
-- Mirrors of the TypeScript item/weapon catalogues. Kept in sync by
-- `pnpm db:seed:generate`; used for market queries, joins and analytics.

create table if not exists public.items (
  id            text primary key,
  name          text        not null,
  description   text        not null default '',
  rarity        text        not null,
  category      text        not null,
  weight        numeric(8,3) not null default 0,
  value         integer     not null default 0,
  stack_size    integer     not null default 1,
  icon          text        not null default 'box',
  width         integer     not null default 1,
  height        integer     not null default 1,
  quest_item    boolean     not null default false,
  tradable      boolean     not null default true,
  metadata      jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create index if not exists items_category_idx on public.items (category);
create index if not exists items_rarity_idx on public.items (rarity);

create table if not exists public.weapons (
  id              text primary key references public.items (id) on delete cascade,
  name            text    not null,
  category        text    not null,
  damage          integer not null,
  fire_rate       integer not null,
  magazine_size   integer not null,
  reload_time     numeric(6,3) not null,
  range_m         integer not null,
  rarity          text    not null,
  value           integer not null,
  ammo_type       text    not null,
  pellets         integer not null default 1,
  automatic       boolean not null default false,
  recoil          jsonb   not null default '{}'::jsonb,
  spread          jsonb   not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

create table if not exists public.missions (
  id             text primary key,
  name           text    not null,
  description    text    not null,
  type           text    not null,
  target         integer not null,
  xp_reward      integer not null default 0,
  credit_reward  integer not null default 0,
  required_level integer not null default 1,
  single_raid    boolean not null default false,
  params         jsonb   not null default '{}'::jsonb,
  requires       text[]  not null default '{}',
  daily_pool     boolean not null default false
);

-- ------------------------------------------------------------------ profiles

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text        not null unique
                check (char_length(username) between 3 and 24),
  level       integer     not null default 1 check (level >= 1),
  xp          integer     not null default 0 check (xp >= 0),
  credits     integer     not null default 10000 check (credits >= 0),
  tutorial_done boolean   not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.player_stats (
  player_id              uuid primary key references public.profiles (id) on delete cascade,
  raids                  integer not null default 0,
  successful_extractions integer not null default 0,
  deaths                 integer not null default 0,
  player_kills           integer not null default 0,
  ai_kills               integer not null default 0,
  loot_extracted_value   bigint  not null default 0,
  damage_dealt           bigint  not null default 0,
  playtime_seconds       bigint  not null default 0,
  updated_at             timestamptz not null default now()
);

-- ------------------------------------------------------------- inventories
-- A single table backs every grid container a player owns. `container` tells
-- them apart, so "extract → stash" is one UPDATE rather than a bespoke path.

create table if not exists public.player_inventory (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  container   text not null check (container in ('stash', 'loadout_backpack', 'loadout_secure')),
  item_id     text not null references public.items (id) on delete cascade,
  quantity    integer not null default 1 check (quantity > 0),
  grid_x      integer not null default 0 check (grid_x >= 0),
  grid_y      integer not null default 0 check (grid_y >= 0),
  rotated     boolean not null default false,
  ammo_in_mag integer,
  durability  numeric(6,2),
  created_at  timestamptz not null default now()
);

create index if not exists player_inventory_player_idx
  on public.player_inventory (player_id, container);

-- Legacy-friendly view: the stash is just the stash container.
create or replace view public.player_stash as
  select id, player_id, item_id, quantity, grid_x, grid_y, rotated, ammo_in_mag, durability, created_at
  from public.player_inventory
  where container = 'stash';

create table if not exists public.player_loadouts (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references public.profiles (id) on delete cascade,
  name                text not null default 'Default',
  primary_weapon_id   text references public.items (id) on delete set null,
  secondary_weapon_id text references public.items (id) on delete set null,
  armor_item_id       text references public.items (id) on delete set null,
  perk_ids            text[] not null default '{}',
  is_active           boolean not null default true,
  updated_at          timestamptz not null default now()
);

create index if not exists player_loadouts_player_idx on public.player_loadouts (player_id);
create unique index if not exists player_loadouts_one_active
  on public.player_loadouts (player_id) where is_active;

-- --------------------------------------------------------------- raid records

create table if not exists public.raid_history (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null references public.profiles (id) on delete cascade,
  room_id          text not null,
  map_id           text not null default 'sector_zero',
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  result           text check (result in ('extracted', 'kia', 'mia')),
  survival_seconds integer not null default 0,
  player_kills     integer not null default 0,
  ai_kills         integer not null default 0,
  loot_value       integer not null default 0,
  xp_earned        integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists raid_history_player_idx on public.raid_history (player_id, started_at desc);
create index if not exists raid_history_room_idx on public.raid_history (room_id);

create table if not exists public.raid_loot (
  id        uuid primary key default gen_random_uuid(),
  raid_id   uuid not null references public.raid_history (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  item_id   text not null references public.items (id) on delete cascade,
  quantity  integer not null default 1 check (quantity > 0),
  value     integer not null default 0,
  extracted boolean not null default false
);

create index if not exists raid_loot_raid_idx on public.raid_loot (raid_id);

-- ------------------------------------------------------------------ missions

create table if not exists public.player_missions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.profiles (id) on delete cascade,
  mission_id text not null references public.missions (id) on delete cascade,
  progress   integer not null default 0 check (progress >= 0),
  completed  boolean not null default false,
  claimed_at timestamptz,
  daily      boolean not null default false,
  reset_key  text,
  updated_at timestamptz not null default now(),
  unique (player_id, mission_id, reset_key)
);

create index if not exists player_missions_player_idx on public.player_missions (player_id);

-- The three missions offered on a given UTC day, shared by every player.
create table if not exists public.daily_missions (
  reset_key  text not null,
  slot       smallint not null check (slot between 0 and 9),
  mission_id text not null references public.missions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reset_key, slot)
);

-- --------------------------------------------------------------- leaderboard

create table if not exists public.leaderboard_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  week_start             date not null,
  player_id              uuid not null references public.profiles (id) on delete cascade,
  username               text not null,
  level                  integer not null default 1,
  loot_extracted_value   bigint not null default 0,
  player_kills           integer not null default 0,
  successful_extractions integer not null default 0,
  created_at             timestamptz not null default now(),
  unique (week_start, player_id)
);

create index if not exists leaderboard_week_loot_idx
  on public.leaderboard_snapshots (week_start, loot_extracted_value desc);
create index if not exists leaderboard_week_kills_idx
  on public.leaderboard_snapshots (week_start, player_kills desc);
create index if not exists leaderboard_week_extracts_idx
  on public.leaderboard_snapshots (week_start, successful_extractions desc);

-- ------------------------------------------------------------------- economy

create table if not exists public.market_transactions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  item_id     text not null references public.items (id) on delete cascade,
  kind        text not null check (kind in ('buy', 'sell')),
  quantity    integer not null check (quantity > 0),
  unit_price  integer not null check (unit_price >= 0),
  total_price integer not null check (total_price >= 0),
  credits_after integer not null check (credits_after >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists market_tx_player_idx on public.market_transactions (player_id, created_at desc);

-- ------------------------------------------------------------- anti-cheat log

create table if not exists public.suspicious_events (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid references public.profiles (id) on delete set null,
  room_id    text,
  kind       text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists suspicious_events_player_idx
  on public.suspicious_events (player_id, created_at desc);

-- ------------------------------------------------------------------ triggers

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists player_stats_touch on public.player_stats;
create trigger player_stats_touch before update on public.player_stats
  for each row execute function public.touch_updated_at();

drop trigger if exists player_missions_touch on public.player_missions;
create trigger player_missions_touch before update on public.player_missions
  for each row execute function public.touch_updated_at();

-- New auth user → profile + stats + starter loadout, all in one transaction.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
  final_username   text;
  suffix           integer := 0;
begin
  desired_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(new.email, '@', 1),
    'operator'
  );
  desired_username := regexp_replace(desired_username, '[^A-Za-z0-9_\-]', '', 'g');
  if char_length(desired_username) < 3 then
    desired_username := 'operator';
  end if;
  desired_username := left(desired_username, 20);

  final_username := desired_username;
  while exists (select 1 from public.profiles p where p.username = final_username) loop
    suffix := suffix + 1;
    final_username := left(desired_username, 16) || suffix::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, final_username)
  on conflict (id) do nothing;

  insert into public.player_stats (player_id)
  values (new.id)
  on conflict (player_id) do nothing;

  insert into public.player_loadouts (player_id, name, primary_weapon_id, perk_ids, is_active)
  values (new.id, 'Standard Issue', 'pm9', array['runner'], true);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
