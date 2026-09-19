import { redirect } from 'next/navigation';
import { PERK_DEFINITIONS, WEAPON_DEFINITIONS, getItem, itemsOfCategory, ItemCategory } from '@deadline/shared';
import { Shell } from '@/components/Shell';
import { loadLoadout, loadOperator } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';
import { LoadoutEditor } from './LoadoutEditor';

export default async function LoadoutPage() {
  if (!(await getSessionUser())) redirect('/login');
  const [operator, { loadout, inventory }] = await Promise.all([loadOperator(), loadLoadout()]);

  const ownedCounts = new Map<string, number>();
  for (const row of inventory) {
    if (row.container !== 'stash') continue;
    ownedCounts.set(row.itemId, (ownedCounts.get(row.itemId) ?? 0) + row.quantity);
  }

  const weapons = WEAPON_DEFINITIONS.map((weapon) => ({
    id: weapon.id,
    name: weapon.name,
    category: weapon.category,
    damage: weapon.damage,
    fireRate: weapon.fireRate,
    magazineSize: weapon.magazineSize,
    range: weapon.range,
    rarity: weapon.rarity,
    owned: ownedCounts.get(weapon.id) ?? 0,
  }));

  const armor = itemsOfCategory(ItemCategory.Armor).map((item) => ({
    id: item.id,
    name: item.name,
    armorPoints: item.armorPoints ?? 0,
    rarity: item.rarity,
    owned: ownedCounts.get(item.id) ?? 0,
  }));

  const packed = inventory
    .filter((row) => row.container !== 'stash')
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      name: getItem(row.itemId)?.name ?? row.itemId,
      quantity: row.quantity,
      container: row.container,
    }));

  const stashConsumables = inventory
    .filter((row) => row.container === 'stash')
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      name: getItem(row.itemId)?.name ?? row.itemId,
      quantity: row.quantity,
      category: getItem(row.itemId)?.category ?? 'crafting',
    }));

  return (
    <Shell operator={operator} active="/loadout">
      <LoadoutEditor
        loadout={{
          primaryWeaponId: loadout.primaryWeaponId,
          secondaryWeaponId: loadout.secondaryWeaponId,
          armorItemId: loadout.armorItemId,
          perkIds: loadout.perkIds,
        }}
        weapons={weapons}
        armor={armor}
        perks={PERK_DEFINITIONS.map((perk) => ({
          id: perk.id,
          name: perk.name,
          description: perk.description,
          unlockLevel: perk.unlockLevel,
          unlocked: operator.profile.level >= perk.unlockLevel,
        }))}
        packed={packed}
        stash={stashConsumables}
      />
    </Shell>
  );
}
