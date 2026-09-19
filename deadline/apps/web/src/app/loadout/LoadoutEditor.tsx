'use client';

import { useState, useTransition } from 'react';
import { rarityColor } from '@deadline/ui';
import { Panel, Empty } from '@/components/Panel';
import { saveLoadout, setInventoryContainer } from '@/lib/actions/player';

interface WeaponOption {
  id: string;
  name: string;
  category: string;
  damage: number;
  fireRate: number;
  magazineSize: number;
  range: number;
  rarity: string;
  owned: number;
}

interface ArmorOption {
  id: string;
  name: string;
  armorPoints: number;
  rarity: string;
  owned: number;
}

interface PerkOption {
  id: string;
  name: string;
  description: string;
  unlockLevel: number;
  unlocked: boolean;
}

interface PackedRow {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  container: string;
}

interface StashRow {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  category: string;
}

const PERK_SLOTS = 2;

/**
 * Loadout editor.
 *
 * Only gear the operator actually owns can be equipped — and equipping it is a
 * commitment: `deploy_loadout` pulls it out of the stash when the raid starts.
 */
export function LoadoutEditor({
  loadout,
  weapons,
  armor,
  perks,
  packed,
  stash,
}: {
  loadout: {
    primaryWeaponId: string | null;
    secondaryWeaponId: string | null;
    armorItemId: string | null;
    perkIds: string[];
  };
  weapons: WeaponOption[];
  armor: ArmorOption[];
  perks: PerkOption[];
  packed: PackedRow[];
  stash: StashRow[];
}) {
  const [draft, setDraft] = useState(loadout);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const commit = (next: typeof draft) => {
    setDraft(next);
    startTransition(async () => {
      const result = await saveLoadout(next);
      setStatus(result.message);
    });
  };

  const togglePerk = (perkId: string) => {
    const has = draft.perkIds.includes(perkId);
    const nextPerks = has
      ? draft.perkIds.filter((id) => id !== perkId)
      : [...draft.perkIds, perkId].slice(-PERK_SLOTS);
    commit({ ...draft, perkIds: nextPerks });
  };

  const move = (entryId: string, container: 'stash' | 'loadout_backpack' | 'loadout_secure') => {
    startTransition(async () => {
      const result = await setInventoryContainer(entryId, container);
      setStatus(result.message);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="dl-heading text-3xl font-bold">Loadout</h1>
        <span className="text-xs text-muted">{pending ? 'Saving…' : (status ?? '')}</span>
      </div>

      <p className="border border-caution/30 bg-caution/5 px-4 py-2.5 text-xs text-caution">
        Equipped gear leaves your stash the moment you deploy. If you do not extract, it is gone.
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="PRIMARY WEAPON">
          <WeaponList
            weapons={weapons}
            selected={draft.primaryWeaponId}
            onSelect={(id) => commit({ ...draft, primaryWeaponId: id })}
          />
        </Panel>

        <Panel title="SECONDARY WEAPON">
          <WeaponList
            weapons={weapons}
            selected={draft.secondaryWeaponId}
            onSelect={(id) => commit({ ...draft, secondaryWeaponId: id })}
          />
        </Panel>

        <Panel title="ARMOUR">
          <div className="space-y-1.5">
            <SelectRow
              label="No armour"
              detail="0 AP"
              selected={draft.armorItemId === null}
              onSelect={() => commit({ ...draft, armorItemId: null })}
              owned
            />
            {armor.map((item) => (
              <SelectRow
                key={item.id}
                label={item.name}
                detail={`${item.armorPoints} AP`}
                color={rarityColor(item.rarity)}
                selected={draft.armorItemId === item.id}
                owned={item.owned > 0}
                ownedCount={item.owned}
                onSelect={() => commit({ ...draft, armorItemId: item.id })}
              />
            ))}
          </div>
        </Panel>

        <Panel title={`PERKS — ${draft.perkIds.length}/${PERK_SLOTS}`}>
          <div className="space-y-1.5">
            {perks.map((perk) => {
              const active = draft.perkIds.includes(perk.id);
              return (
                <button
                  key={perk.id}
                  type="button"
                  disabled={!perk.unlocked}
                  onClick={() => togglePerk(perk.id)}
                  className={[
                    'block w-full border px-3 py-2 text-left transition-colors',
                    active ? 'border-signal bg-signal/10' : 'border-edge hover:border-muted',
                    perk.unlocked ? '' : 'cursor-not-allowed opacity-40',
                  ].join(' ')}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="dl-heading text-sm">{perk.name}</span>
                    <span className="text-[10px] tracking-[0.2em] text-muted">
                      {perk.unlocked ? (active ? 'EQUIPPED' : 'AVAILABLE') : `LVL ${perk.unlockLevel}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{perk.description}</p>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="PACKED FOR THE RAID" className="xl:col-span-2">
          {packed.length === 0 ? (
            <Empty>
              Nothing packed. Move medical supplies or valuables from the stash below — anything in
              the secure container survives your death.
            </Empty>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {packed.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between border border-edge bg-void/40 px-3 py-2 text-xs"
                >
                  <span>
                    {row.name}
                    {row.quantity > 1 && <span className="text-muted"> ×{row.quantity}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        row.container === 'loadout_secure'
                          ? 'text-[9px] tracking-[0.2em] text-uncommon'
                          : 'text-[9px] tracking-[0.2em] text-muted'
                      }
                    >
                      {row.container === 'loadout_secure' ? 'SECURE' : 'BACKPACK'}
                    </span>
                    <button
                      type="button"
                      onClick={() => move(row.id, 'stash')}
                      className="text-[10px] tracking-[0.2em] text-signal hover:underline"
                    >
                      UNPACK
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="STASH" className="xl:col-span-2">
          {stash.length === 0 ? (
            <Empty>Your stash is empty. Buy supplies from the market or extract with loot.</Empty>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {stash.slice(0, 36).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between border border-edge bg-void/40 px-3 py-2 text-xs"
                >
                  <span>
                    {row.name}
                    {row.quantity > 1 && <span className="text-muted"> ×{row.quantity}</span>}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => move(row.id, 'loadout_backpack')}
                      className="text-[10px] tracking-[0.2em] text-muted hover:text-ink"
                    >
                      PACK
                    </button>
                    <button
                      type="button"
                      onClick={() => move(row.id, 'loadout_secure')}
                      className="text-[10px] tracking-[0.2em] text-uncommon hover:underline"
                    >
                      SECURE
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function WeaponList({
  weapons,
  selected,
  onSelect,
}: {
  weapons: WeaponOption[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <SelectRow label="Empty slot" detail="" selected={selected === null} owned onSelect={() => onSelect(null)} />
      {weapons.map((weapon) => (
        <SelectRow
          key={weapon.id}
          label={weapon.name}
          detail={`${weapon.damage} DMG · ${weapon.fireRate} RPM · ${weapon.magazineSize} RDS · ${weapon.range} M`}
          color={rarityColor(weapon.rarity)}
          selected={selected === weapon.id}
          owned={weapon.owned > 0}
          ownedCount={weapon.owned}
          onSelect={() => onSelect(weapon.id)}
        />
      ))}
    </div>
  );
}

function SelectRow({
  label,
  detail,
  color,
  selected,
  owned,
  ownedCount,
  onSelect,
}: {
  label: string;
  detail: string;
  color?: string;
  selected: boolean;
  owned: boolean;
  ownedCount?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!owned}
      className={[
        'block w-full border px-3 py-2 text-left transition-colors',
        selected ? 'border-signal bg-signal/10' : 'border-edge hover:border-muted',
        owned ? '' : 'cursor-not-allowed opacity-35',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="dl-heading text-sm" style={color ? { color } : undefined}>
          {label}
        </span>
        <span className="text-[10px] tracking-[0.15em] text-muted">
          {owned ? (ownedCount !== undefined && ownedCount > 0 ? `OWNED ×${ownedCount}` : '') : 'NOT OWNED'}
        </span>
      </div>
      {detail && <p className="mt-0.5 font-mono text-[10px] text-muted">{detail}</p>}
    </button>
  );
}
