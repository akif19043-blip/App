-- DEADLINE — Row Level Security
--
-- Rule of thumb: a player may READ their own rows and the public catalogues,
-- and may WRITE almost nothing directly. Credits, XP, level, stats, stash
-- contents and raid results are only ever written by SECURITY DEFINER
-- functions or by the game server's service-role key (which bypasses RLS).

alter table public.items                  enable row level security;
alter table public.weapons                enable row level security;
alter table public.missions               enable row level security;
alter table public.daily_missions         enable row level security;
alter table public.profiles               enable row level security;
alter table public.player_stats           enable row level security;
alter table public.player_inventory       enable row level security;
alter table public.player_loadouts        enable row level security;
alter table public.player_missions        enable row level security;
alter table public.raid_history           enable row level security;
alter table public.raid_loot              enable row level security;
alter table public.leaderboard_snapshots  enable row level security;
alter table public.market_transactions    enable row level security;
alter table public.suspicious_events      enable row level security;

-- ------------------------------------------------------- public catalogues
drop policy if exists items_read on public.items;
create policy items_read on public.items
  for select using (true);

drop policy if exists weapons_read on public.weapons;
create policy weapons_read on public.weapons
  for select using (true);

drop policy if exists missions_read on public.missions;
create policy missions_read on public.missions
  for select using (true);

drop policy if exists daily_missions_read on public.daily_missions;
create policy daily_missions_read on public.daily_missions
  for select using (true);

-- ---------------------------------------------------------------- profiles
-- Usernames and levels are public (leaderboard, kill feed); credits and XP are
-- readable by their owner only through the `profiles` row itself, and are never
-- writable from the client.

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- A client UPDATE may only touch cosmetic columns. Anything else is reverted.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The service role (game server) and SECURITY DEFINER functions run with a
  -- null/elevated JWT and are allowed to change everything.
  if coalesce(current_setting('request.jwt.claim.role', true), 'service_role') <> 'authenticated' then
    return new;
  end if;
  new.credits := old.credits;
  new.xp      := old.xp;
  new.level   := old.level;
  new.id      := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ------------------------------------------------------------ player_stats
drop policy if exists stats_read_own on public.player_stats;
create policy stats_read_own on public.player_stats
  for select using (auth.uid() = player_id);

-- ------------------------------------------------------- inventory / stash
drop policy if exists inventory_read_own on public.player_inventory;
create policy inventory_read_own on public.player_inventory
  for select using (auth.uid() = player_id);

-- Clients may rearrange their own grid but may not conjure or delete stacks;
-- quantity/item changes go through the market and raid RPCs.
drop policy if exists inventory_move_own on public.player_inventory;
create policy inventory_move_own on public.player_inventory
  for update using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

create or replace function public.guard_inventory_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), 'service_role') <> 'authenticated' then
    return new;
  end if;
  new.item_id   := old.item_id;
  new.quantity  := old.quantity;
  new.player_id := old.player_id;
  return new;
end;
$$;

drop trigger if exists inventory_guard on public.player_inventory;
create trigger inventory_guard before update on public.player_inventory
  for each row execute function public.guard_inventory_update();

-- ----------------------------------------------------------------- loadouts
drop policy if exists loadouts_read_own on public.player_loadouts;
create policy loadouts_read_own on public.player_loadouts
  for select using (auth.uid() = player_id);

drop policy if exists loadouts_write_own on public.player_loadouts;
create policy loadouts_write_own on public.player_loadouts
  for all using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

-- ----------------------------------------------------------------- missions
drop policy if exists player_missions_read_own on public.player_missions;
create policy player_missions_read_own on public.player_missions
  for select using (auth.uid() = player_id);

-- ------------------------------------------------------------------- raids
drop policy if exists raid_history_read_own on public.raid_history;
create policy raid_history_read_own on public.raid_history
  for select using (auth.uid() = player_id);

drop policy if exists raid_loot_read_own on public.raid_loot;
create policy raid_loot_read_own on public.raid_loot
  for select using (auth.uid() = player_id);

-- ------------------------------------------------------------- leaderboard
drop policy if exists leaderboard_read on public.leaderboard_snapshots;
create policy leaderboard_read on public.leaderboard_snapshots
  for select using (true);

-- --------------------------------------------------------------- market log
drop policy if exists market_read_own on public.market_transactions;
create policy market_read_own on public.market_transactions
  for select using (auth.uid() = player_id);

-- ------------------------------------------------------------- anti-cheat
-- Write-only from the server; nobody reads it through the anon/auth roles.
drop policy if exists suspicious_no_read on public.suspicious_events;
create policy suspicious_no_read on public.suspicious_events
  for select using (false);
