/**
 * Generates `supabase/seed/catalog.sql` from the TypeScript catalogues.
 *
 * The item, weapon and mission tables in Postgres are mirrors of the data in
 * `@deadline/shared`. Rather than maintaining two copies by hand, this script
 * emits the SQL. Re-run it (`pnpm db:seed:generate`) whenever the catalogue
 * changes, and commit the result.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = await import(join(root, 'packages/shared/dist/index.js'));

const {
  ITEM_CATALOG,
  WEAPON_DEFINITIONS,
  MISSION_DEFINITIONS,
  DAILY_MISSION_POOL,
} = shared;

/** Single-quote escaping for SQL string literals. */
function sql(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonb(value) {
  return `${sql(JSON.stringify(value ?? {}))}::jsonb`;
}

function textArray(values) {
  if (!values || values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map((entry) => sql(entry)).join(', ')}]::text[]`;
}

const lines = [];
lines.push('-- GENERATED FILE — do not edit by hand.');
lines.push('-- Regenerate with: pnpm db:seed:generate');
lines.push('--');
lines.push('-- Mirrors the TypeScript catalogues in packages/shared into Postgres so the');
lines.push('-- market, raid ledger and analytics can join against real rows.');
lines.push('');

lines.push('insert into public.items (');
lines.push('  id, name, description, rarity, category, weight, value, stack_size, icon,');
lines.push('  width, height, quest_item, tradable, metadata');
lines.push(') values');
lines.push(
  ITEM_CATALOG.map((item) => {
    const metadata = {};
    for (const key of [
      'healAmount',
      'useTimeSeconds',
      'armorPoints',
      'unlocksRoomId',
      'roundsPerUnit',
    ]) {
      if (item[key] !== undefined) metadata[key] = item[key];
    }
    return `  (${[
      sql(item.id),
      sql(item.name),
      sql(item.description),
      sql(item.rarity),
      sql(item.category),
      sql(item.weight),
      sql(item.value),
      sql(item.stackSize),
      sql(item.icon),
      sql(item.width),
      sql(item.height),
      sql(item.questItem),
      sql(item.tradable),
      jsonb(metadata),
    ].join(', ')})`;
  }).join(',\n'),
);
lines.push('on conflict (id) do update set');
lines.push('  name = excluded.name,');
lines.push('  description = excluded.description,');
lines.push('  rarity = excluded.rarity,');
lines.push('  category = excluded.category,');
lines.push('  weight = excluded.weight,');
lines.push('  value = excluded.value,');
lines.push('  stack_size = excluded.stack_size,');
lines.push('  icon = excluded.icon,');
lines.push('  width = excluded.width,');
lines.push('  height = excluded.height,');
lines.push('  quest_item = excluded.quest_item,');
lines.push('  tradable = excluded.tradable,');
lines.push('  metadata = excluded.metadata,');
lines.push('  updated_at = now();');
lines.push('');

lines.push('insert into public.weapons (');
lines.push('  id, name, category, damage, fire_rate, magazine_size, reload_time, range_m,');
lines.push('  rarity, value, ammo_type, pellets, automatic, recoil, spread');
lines.push(') values');
lines.push(
  WEAPON_DEFINITIONS.map(
    (weapon) =>
      `  (${[
        sql(weapon.id),
        sql(weapon.name),
        sql(weapon.category),
        sql(weapon.damage),
        sql(weapon.fireRate),
        sql(weapon.magazineSize),
        sql(weapon.reloadTimeSeconds),
        sql(weapon.range),
        sql(weapon.rarity),
        sql(weapon.value),
        sql(weapon.ammoType),
        sql(weapon.pellets),
        sql(weapon.automatic),
        jsonb(weapon.recoil),
        jsonb(weapon.spread),
      ].join(', ')})`,
  ).join(',\n'),
);
lines.push('on conflict (id) do update set');
lines.push('  name = excluded.name,');
lines.push('  category = excluded.category,');
lines.push('  damage = excluded.damage,');
lines.push('  fire_rate = excluded.fire_rate,');
lines.push('  magazine_size = excluded.magazine_size,');
lines.push('  reload_time = excluded.reload_time,');
lines.push('  range_m = excluded.range_m,');
lines.push('  rarity = excluded.rarity,');
lines.push('  value = excluded.value,');
lines.push('  ammo_type = excluded.ammo_type,');
lines.push('  pellets = excluded.pellets,');
lines.push('  automatic = excluded.automatic,');
lines.push('  recoil = excluded.recoil,');
lines.push('  spread = excluded.spread,');
lines.push('  updated_at = now();');
lines.push('');

const allMissions = [
  ...MISSION_DEFINITIONS.map((mission) => ({ mission, daily: false })),
  ...DAILY_MISSION_POOL.map((mission) => ({ mission, daily: true })),
];

lines.push('insert into public.missions (');
lines.push('  id, name, description, type, target, xp_reward, credit_reward,');
lines.push('  required_level, single_raid, params, requires, daily_pool');
lines.push(') values');
lines.push(
  allMissions
    .map(
      ({ mission, daily }) =>
        `  (${[
          sql(mission.id),
          sql(mission.name),
          sql(mission.description),
          sql(mission.type),
          sql(mission.target),
          sql(mission.xpReward),
          sql(mission.creditReward),
          sql(mission.requiredLevel),
          sql(mission.singleRaid),
          jsonb(mission.params ?? {}),
          textArray(mission.requires),
          sql(daily),
        ].join(', ')})`,
    )
    .join(',\n'),
);
lines.push('on conflict (id) do update set');
lines.push('  name = excluded.name,');
lines.push('  description = excluded.description,');
lines.push('  type = excluded.type,');
lines.push('  target = excluded.target,');
lines.push('  xp_reward = excluded.xp_reward,');
lines.push('  credit_reward = excluded.credit_reward,');
lines.push('  required_level = excluded.required_level,');
lines.push('  single_raid = excluded.single_raid,');
lines.push('  params = excluded.params,');
lines.push('  requires = excluded.requires,');
lines.push('  daily_pool = excluded.daily_pool;');
lines.push('');

const out = join(root, 'supabase/seed/catalog.sql');
await writeFile(out, `${lines.join('\n')}\n`, 'utf8');
console.log(
  `wrote ${out}: ${ITEM_CATALOG.length} items, ${WEAPON_DEFINITIONS.length} weapons, ${allMissions.length} missions`,
);
