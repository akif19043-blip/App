-- GENERATED FILE — do not edit by hand.
-- Regenerate with: pnpm db:seed:generate
--
-- Mirrors the TypeScript catalogues in packages/shared into Postgres so the
-- market, raid ledger and analytics can join against real rows.

insert into public.items (
  id, name, description, rarity, category, weight, value, stack_size, icon,
  width, height, quest_item, tradable, metadata
) values
  ('scrap_metal', 'Scrap Metal', 'Twisted rebar and plating stripped from the quarantine barricades.', 'common', 'crafting', 1.2, 180, 6, 'scrap', 1, 1, false, true, '{}'::jsonb),
  ('weapon_parts', 'Weapon Parts', 'Springs, pins and a usable bolt carrier. Gunsmiths pay well.', 'uncommon', 'crafting', 0.9, 620, 4, 'parts', 1, 2, false, true, '{}'::jsonb),
  ('duct_tape', 'Industrial Tape', 'Holds the district together. Mostly.', 'common', 'crafting', 0.3, 95, 8, 'tape', 1, 1, false, true, '{}'::jsonb),
  ('broken_phone', 'Broken Phone', 'Cracked screen, intact board. The board is the valuable part.', 'common', 'electronics', 0.2, 240, 4, 'phone', 1, 1, false, true, '{}'::jsonb),
  ('military_battery', 'Military Battery', 'Sealed cell from a field generator. Still holds charge.', 'rare', 'electronics', 3.4, 2400, 1, 'battery', 2, 2, false, true, '{}'::jsonb),
  ('encrypted_drive', 'Encrypted Drive', 'Quarantine authority data. Someone outside the wall wants this.', 'epic', 'electronics', 0.4, 5800, 1, 'drive', 1, 1, true, true, '{}'::jsonb),
  ('experimental_chip', 'Experimental Chip', 'Unlabelled silicon from the bunker labs. Warm to the touch.', 'epic', 'electronics', 0.1, 8600, 1, 'chip', 1, 1, false, true, '{}'::jsonb),
  ('ai_core', 'AI Core', 'The reason Sector Zero was sealed. Do not let it leave your hands.', 'legendary', 'electronics', 2.1, 24000, 1, 'core', 2, 2, true, true, '{}'::jsonb),
  ('gold_watch', 'Gold Watch', 'Stopped at 04:12, the moment the sirens started.', 'rare', 'valuable', 0.1, 3100, 2, 'watch', 1, 1, false, true, '{}'::jsonb),
  ('cash_bundle', 'Cash Bundle', 'Pre-quarantine notes. Still spends at the wall.', 'uncommon', 'valuable', 0.2, 860, 5, 'cash', 1, 1, false, true, '{}'::jsonb),
  ('silver_ingot', 'Silver Ingot', 'Looted from the market street vault before the collapse.', 'rare', 'valuable', 4.8, 4200, 1, 'ingot', 2, 1, false, true, '{}'::jsonb),
  ('bandage', 'Field Bandage', 'Stops the bleeding. Barely.', 'common', 'medical', 0.1, 220, 6, 'bandage', 1, 1, false, true, '{"healAmount":25,"useTimeSeconds":2.2}'::jsonb),
  ('medical_kit', 'Medical Kit', 'Compact trauma kit. The difference between MIA and EXTRACTED.', 'uncommon', 'medical', 1.1, 1150, 2, 'medkit', 2, 1, false, true, '{"healAmount":60,"useTimeSeconds":4}'::jsonb),
  ('combat_stim', 'Combat Stim', 'Military-grade adrenaline. Full heal, wrecked hands.', 'rare', 'medical', 0.2, 2600, 2, 'stim', 1, 1, false, true, '{"healAmount":100,"useTimeSeconds":2.5}'::jsonb),
  ('armor_light_vest', 'Patrol Vest', 'Police-issue soft armour. Stops pistol rounds, not much else.', 'common', 'armor', 3.2, 1400, 1, 'vest-light', 2, 2, false, true, '{"armorPoints":35}'::jsonb),
  ('armor_tactical_rig', 'Tactical Rig', 'Ceramic plates in a scarred nylon carrier.', 'rare', 'armor', 6.4, 4800, 1, 'vest-tactical', 2, 2, false, true, '{"armorPoints":70}'::jsonb),
  ('armor_heavy_plate', 'Breacher Plate', 'Bunker guard armour. Heavy enough that you hear yourself coming.', 'epic', 'armor', 11.2, 9400, 1, 'vest-heavy', 2, 3, false, true, '{"armorPoints":100}'::jsonb),
  ('ammo_light', '9mm Rounds', 'Feeds pistols and SMGs.', 'common', 'ammo', 0.3, 120, 8, 'ammo-light', 1, 1, false, true, '{"roundsPerUnit":30}'::jsonb),
  ('ammo_medium', '5.56 Rounds', 'Standard rifle ammunition.', 'common', 'ammo', 0.4, 190, 8, 'ammo-medium', 1, 1, false, true, '{"roundsPerUnit":30}'::jsonb),
  ('ammo_heavy', '7.62 Rounds', 'Marksman ammunition. Punches through plate.', 'uncommon', 'ammo', 0.6, 320, 6, 'ammo-heavy', 1, 1, false, true, '{"roundsPerUnit":20}'::jsonb),
  ('ammo_shell', '12ga Shells', 'Buckshot. Close work only.', 'common', 'ammo', 0.5, 160, 6, 'ammo-shell', 1, 1, false, true, '{"roundsPerUnit":18}'::jsonb),
  ('key_police_armory', 'Police Armory Key', 'Opens the sealed armoury behind the station front desk.', 'rare', 'key', 0.05, 3400, 1, 'key', 1, 1, false, true, '{"unlocksRoomId":"police_armory"}'::jsonb),
  ('key_bunker_access', 'Bunker Keycard', 'Quarantine authority clearance. The bunker vault answers to it.', 'epic', 'key', 0.05, 7200, 1, 'keycard', 1, 1, false, true, '{"unlocksRoomId":"bunker_vault"}'::jsonb),
  ('access_card', 'Access Card', 'Generic staff card. Traders collect them for the chip inside.', 'uncommon', 'quest', 0.05, 740, 3, 'card', 1, 1, true, true, '{}'::jsonb),
  ('pm9', 'PM-9', 'Sidearm issued to quarantine patrols. Reliable, unremarkable.', 'common', 'weapon', 1.1, 2200, 1, 'weapon-pistol', 2, 1, false, true, '{}'::jsonb),
  ('vx7', 'VX-7', 'Compact submachine gun. Shreds at room distance, wanders past it.', 'uncommon', 'weapon', 2.6, 5600, 1, 'weapon-smg', 3, 2, false, true, '{}'::jsonb),
  ('ar12', 'AR-12', 'The district standard. Handles everything from alleys to avenues.', 'rare', 'weapon', 3.5, 11800, 1, 'weapon-assault_rifle', 4, 2, false, true, '{}'::jsonb),
  ('m14x', 'M14-X', 'Marksman rifle. Two hits end most arguments across Market Street.', 'epic', 'weapon', 4.4, 21500, 1, 'weapon-dmr', 4, 2, false, true, '{}'::jsonb),
  ('breach8', 'Breach-8', 'Breaching shotgun. Eight pellets, one very short conversation.', 'rare', 'weapon', 3.9, 9400, 1, 'weapon-shotgun', 4, 2, false, true, '{}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  rarity = excluded.rarity,
  category = excluded.category,
  weight = excluded.weight,
  value = excluded.value,
  stack_size = excluded.stack_size,
  icon = excluded.icon,
  width = excluded.width,
  height = excluded.height,
  quest_item = excluded.quest_item,
  tradable = excluded.tradable,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.weapons (
  id, name, category, damage, fire_rate, magazine_size, reload_time, range_m,
  rarity, value, ammo_type, pellets, automatic, recoil, spread
) values
  ('pm9', 'PM-9', 'pistol', 25, 400, 15, 1.6, 32, 'common', 2200, 'ammo_light', 1, false, '{"vertical":0.85,"horizontal":0.35,"recovery":7.5,"adsMultiplier":0.7,"rampPerShot":0.06,"maxMultiplier":1.7}'::jsonb, '{"base":1.2,"moving":1.6,"adsMultiplier":0.45,"perShot":0.35,"max":4.5}'::jsonb),
  ('vx7', 'VX-7', 'smg', 20, 750, 30, 2.1, 38, 'uncommon', 5600, 'ammo_light', 1, true, '{"vertical":0.62,"horizontal":0.42,"recovery":9,"adsMultiplier":0.72,"rampPerShot":0.05,"maxMultiplier":2}'::jsonb, '{"base":1.7,"moving":1.5,"adsMultiplier":0.55,"perShot":0.24,"max":6}'::jsonb),
  ('ar12', 'AR-12', 'assault_rifle', 32, 600, 30, 2.4, 62, 'rare', 11800, 'ammo_medium', 1, true, '{"vertical":0.78,"horizontal":0.34,"recovery":8.2,"adsMultiplier":0.62,"rampPerShot":0.055,"maxMultiplier":2.1}'::jsonb, '{"base":1.3,"moving":1.8,"adsMultiplier":0.35,"perShot":0.2,"max":5.2}'::jsonb),
  ('m14x', 'M14-X', 'dmr', 55, 240, 12, 2.9, 110, 'epic', 21500, 'ammo_heavy', 1, false, '{"vertical":1.9,"horizontal":0.5,"recovery":6.4,"adsMultiplier":0.58,"rampPerShot":0.09,"maxMultiplier":2.4}'::jsonb, '{"base":1.1,"moving":2.6,"adsMultiplier":0.18,"perShot":0.5,"max":6.5}'::jsonb),
  ('breach8', 'Breach-8', 'shotgun', 13, 90, 6, 3.2, 14, 'rare', 9400, 'ammo_shell', 8, false, '{"vertical":2.4,"horizontal":0.7,"recovery":5.8,"adsMultiplier":0.75,"rampPerShot":0.12,"maxMultiplier":2}'::jsonb, '{"base":4.2,"moving":1.2,"adsMultiplier":0.7,"perShot":0.3,"max":8}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  damage = excluded.damage,
  fire_rate = excluded.fire_rate,
  magazine_size = excluded.magazine_size,
  reload_time = excluded.reload_time,
  range_m = excluded.range_m,
  rarity = excluded.rarity,
  value = excluded.value,
  ammo_type = excluded.ammo_type,
  pellets = excluded.pellets,
  automatic = excluded.automatic,
  recoil = excluded.recoil,
  spread = excluded.spread,
  updated_at = now();

insert into public.missions (
  id, name, description, type, target, xp_reward, credit_reward,
  required_level, single_raid, params, requires, daily_pool
) values
  ('first_run', 'FIRST RUN', 'Extract successfully once.', 'extract', 1, 500, 2500, 1, false, '{}'::jsonb, '{}'::text[], false),
  ('cleanup', 'CLEANUP', 'Kill 5 AI enemies.', 'kill_ai', 5, 600, 3000, 1, false, '{}'::jsonb, '{}'::text[], false),
  ('scavenger_run', 'SCAVENGER', 'Extract with loot worth 5,000 credits.', 'loot_value', 5000, 900, 4000, 1, true, '{"mustExtract":true}'::jsonb, ARRAY['first_run']::text[], false),
  ('high_value_target', 'HIGH VALUE TARGET', 'Kill 1 player.', 'kill_players', 1, 1200, 5000, 2, false, '{}'::jsonb, '{}'::text[], false),
  ('recovery', 'RECOVERY', 'Extract with an Encrypted Drive.', 'collect_item', 1, 2500, 9000, 3, true, '{"itemId":"encrypted_drive"}'::jsonb, ARRAY['scavenger_run']::text[], false),
  ('deep_sweep', 'DEEP SWEEP', 'Reach the Underground Bunker and extract afterwards.', 'visit_location', 1, 1800, 7500, 4, true, '{"poiId":"bunker","mustExtract":true}'::jsonb, '{}'::text[], false),
  ('daily_kill_ai_10', 'PEST CONTROL', 'Kill 10 AI enemies.', 'kill_ai', 10, 800, 4000, 1, false, '{}'::jsonb, '{}'::text[], true),
  ('daily_extract_2', 'DOUBLE OUT', 'Extract twice.', 'extract', 2, 900, 4500, 1, false, '{}'::jsonb, '{}'::text[], true),
  ('daily_loot_15k', 'HAUL', 'Extract with 15,000 credits of loot.', 'loot_value', 15000, 1400, 6000, 1, false, '{"mustExtract":true}'::jsonb, '{}'::text[], true),
  ('daily_kill_player_1', 'CONTESTED', 'Kill 1 player.', 'kill_players', 1, 1100, 5500, 1, false, '{}'::jsonb, '{}'::text[], true),
  ('daily_visit_hospital', 'HOUSE CALL', 'Reach the Old Hospital.', 'visit_location', 1, 700, 3200, 1, false, '{"poiId":"hospital"}'::jsonb, '{}'::text[], true),
  ('daily_visit_warehouse', 'FREIGHT RUN', 'Reach the Warehouse District.', 'visit_location', 1, 700, 3200, 1, false, '{"poiId":"warehouse"}'::jsonb, '{}'::text[], true),
  ('daily_collect_battery', 'POWER SUPPLY', 'Extract with a Military Battery.', 'collect_item', 1, 1300, 5800, 1, false, '{"itemId":"military_battery"}'::jsonb, '{}'::text[], true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  target = excluded.target,
  xp_reward = excluded.xp_reward,
  credit_reward = excluded.credit_reward,
  required_level = excluded.required_level,
  single_raid = excluded.single_raid,
  params = excluded.params,
  requires = excluded.requires,
  daily_pool = excluded.daily_pool;

