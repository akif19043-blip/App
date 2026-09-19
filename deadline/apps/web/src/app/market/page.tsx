import { redirect } from 'next/navigation';
import { ItemCategory, sellPrice } from '@deadline/shared';
import { Shell } from '@/components/Shell';
import { loadMarket } from '@/lib/queries';
import { getSessionUser } from '@/lib/session';
import { MarketBrowser } from './MarketBrowser';

export default async function MarketPage() {
  if (!(await getSessionUser())) redirect('/login');
  const { operator, stash, stock } = await loadMarket();

  return (
    <Shell operator={operator} active="/market">
      <MarketBrowser
        credits={operator.profile.credits}
        stock={stock.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          rarity: item.rarity,
          price: item.value,
          width: item.width,
          height: item.height,
        }))}
        stash={stash.rows.map((row) => ({
          id: row.id,
          itemId: row.itemId,
          name: row.name,
          rarity: row.rarity,
          quantity: row.quantity,
          unitSellPrice: sellPrice(row.itemId, 1),
          category: (row.itemId.startsWith('ammo_') ? ItemCategory.Ammo : 'other') as string,
        }))}
      />
    </Shell>
  );
}
