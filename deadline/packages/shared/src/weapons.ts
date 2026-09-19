import { AmmoType, ItemCategory, Rarity, WeaponCategory } from './enums.js';
import type { ItemDefinition } from './items.js';

/**
 * Data-driven weapon definition. Adding a weapon here is the only change
 * required to ship it: the item catalogue entry, the vendor listing, the loot
 * tables and the client model are all derived from these fields.
 */
export interface WeaponDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: WeaponCategory;
  /** Damage per bullet (per pellet for shotguns) at effective range. */
  readonly damage: number;
  /** Rounds per minute. */
  readonly fireRate: number;
  readonly magazineSize: number;
  readonly reloadTimeSeconds: number;
  /** Effective range in metres; damage falls off beyond this. */
  readonly range: number;
  readonly rarity: Rarity;
  readonly value: number;
  readonly ammoType: AmmoType;
  /** Pellets fired per trigger pull. 1 for everything but shotguns. */
  readonly pellets: number;
  /** Fully automatic fire while the trigger is held. */
  readonly automatic: boolean;
  readonly recoil: WeaponRecoil;
  readonly spread: WeaponSpread;
  /** Grid footprint when carried in the backpack. */
  readonly width: number;
  readonly height: number;
  readonly weight: number;
  readonly description: string;
}

export interface WeaponRecoil {
  /** Degrees of upward camera kick per shot. */
  readonly vertical: number;
  /** Maximum degrees of horizontal kick per shot (sign is randomised). */
  readonly horizontal: number;
  /** Degrees per second the camera returns toward the pre-fire aim point. */
  readonly recovery: number;
  /** Multiplier applied to both axes while aiming down sights. */
  readonly adsMultiplier: number;
  /** Multiplier applied per consecutive shot, capped by `maxMultiplier`. */
  readonly rampPerShot: number;
  readonly maxMultiplier: number;
}

export interface WeaponSpread {
  /** Cone half-angle in degrees while standing still and hip-firing. */
  readonly base: number;
  /** Additional degrees at full movement speed. */
  readonly moving: number;
  /** Multiplier while aiming down sights. */
  readonly adsMultiplier: number;
  /** Degrees added per consecutive shot. */
  readonly perShot: number;
  readonly max: number;
}

function weapon(w: WeaponDefinition): WeaponDefinition {
  return w;
}

export const WEAPON_DEFINITIONS: readonly WeaponDefinition[] = [
  weapon({
    id: 'pm9',
    name: 'PM-9',
    category: WeaponCategory.Pistol,
    damage: 25,
    fireRate: 400,
    magazineSize: 15,
    reloadTimeSeconds: 1.6,
    range: 32,
    rarity: Rarity.Common,
    value: 2_200,
    ammoType: AmmoType.Light,
    pellets: 1,
    automatic: false,
    recoil: {
      vertical: 0.85,
      horizontal: 0.35,
      recovery: 7.5,
      adsMultiplier: 0.7,
      rampPerShot: 0.06,
      maxMultiplier: 1.7,
    },
    spread: { base: 1.2, moving: 1.6, adsMultiplier: 0.45, perShot: 0.35, max: 4.5 },
    width: 2,
    height: 1,
    weight: 1.1,
    description: 'Sidearm issued to quarantine patrols. Reliable, unremarkable.',
  }),
  weapon({
    id: 'vx7',
    name: 'VX-7',
    category: WeaponCategory.SMG,
    damage: 20,
    fireRate: 750,
    magazineSize: 30,
    reloadTimeSeconds: 2.1,
    range: 38,
    rarity: Rarity.Uncommon,
    value: 5_600,
    ammoType: AmmoType.Light,
    pellets: 1,
    automatic: true,
    recoil: {
      vertical: 0.62,
      horizontal: 0.42,
      recovery: 9,
      adsMultiplier: 0.72,
      rampPerShot: 0.05,
      maxMultiplier: 2,
    },
    spread: { base: 1.7, moving: 1.5, adsMultiplier: 0.55, perShot: 0.24, max: 6 },
    width: 3,
    height: 2,
    weight: 2.6,
    description: 'Compact submachine gun. Shreds at room distance, wanders past it.',
  }),
  weapon({
    id: 'ar12',
    name: 'AR-12',
    category: WeaponCategory.AssaultRifle,
    damage: 32,
    fireRate: 600,
    magazineSize: 30,
    reloadTimeSeconds: 2.4,
    range: 62,
    rarity: Rarity.Rare,
    value: 11_800,
    ammoType: AmmoType.Medium,
    pellets: 1,
    automatic: true,
    recoil: {
      vertical: 0.78,
      horizontal: 0.34,
      recovery: 8.2,
      adsMultiplier: 0.62,
      rampPerShot: 0.055,
      maxMultiplier: 2.1,
    },
    spread: { base: 1.3, moving: 1.8, adsMultiplier: 0.35, perShot: 0.2, max: 5.2 },
    width: 4,
    height: 2,
    weight: 3.5,
    description: 'The district standard. Handles everything from alleys to avenues.',
  }),
  weapon({
    id: 'm14x',
    name: 'M14-X',
    category: WeaponCategory.DMR,
    damage: 55,
    fireRate: 240,
    magazineSize: 12,
    reloadTimeSeconds: 2.9,
    range: 110,
    rarity: Rarity.Epic,
    value: 21_500,
    ammoType: AmmoType.Heavy,
    pellets: 1,
    automatic: false,
    recoil: {
      vertical: 1.9,
      horizontal: 0.5,
      recovery: 6.4,
      adsMultiplier: 0.58,
      rampPerShot: 0.09,
      maxMultiplier: 2.4,
    },
    spread: { base: 1.1, moving: 2.6, adsMultiplier: 0.18, perShot: 0.5, max: 6.5 },
    width: 4,
    height: 2,
    weight: 4.4,
    description: 'Marksman rifle. Two hits end most arguments across Market Street.',
  }),
  weapon({
    id: 'breach8',
    name: 'Breach-8',
    category: WeaponCategory.Shotgun,
    damage: 13,
    fireRate: 90,
    magazineSize: 6,
    reloadTimeSeconds: 3.2,
    range: 14,
    rarity: Rarity.Rare,
    value: 9_400,
    ammoType: AmmoType.Shell,
    pellets: 8,
    automatic: false,
    recoil: {
      vertical: 2.4,
      horizontal: 0.7,
      recovery: 5.8,
      adsMultiplier: 0.75,
      rampPerShot: 0.12,
      maxMultiplier: 2,
    },
    spread: { base: 4.2, moving: 1.2, adsMultiplier: 0.7, perShot: 0.3, max: 8 },
    width: 4,
    height: 2,
    weight: 3.9,
    description: 'Breaching shotgun. Eight pellets, one very short conversation.',
  }),
];

const WEAPON_INDEX: ReadonlyMap<string, WeaponDefinition> = new Map(
  WEAPON_DEFINITIONS.map((w) => [w.id, w]),
);

export function getWeaponDefinition(id: string): WeaponDefinition | undefined {
  return WEAPON_INDEX.get(id);
}

export function requireWeaponDefinition(id: string): WeaponDefinition {
  const found = WEAPON_INDEX.get(id);
  if (!found) throw new Error(`Unknown weapon definition: ${id}`);
  return found;
}

/** Seconds between two legal shots for this weapon. */
export function shotIntervalSeconds(weaponDef: WeaponDefinition): number {
  return 60 / weaponDef.fireRate;
}

/** Every weapon also exists as an inventory item; this derives that entry. */
export function weaponToItemDefinition(w: WeaponDefinition): ItemDefinition {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    rarity: w.rarity,
    category: ItemCategory.Weapon,
    weight: w.weight,
    value: w.value,
    stackSize: 1,
    icon: `weapon-${w.category}`,
    width: w.width,
    height: w.height,
    questItem: false,
    tradable: true,
  };
}

export const WEAPON_ITEM_DEFINITIONS: readonly ItemDefinition[] =
  WEAPON_DEFINITIONS.map(weaponToItemDefinition);

/** Default ammo item id for a weapon, used by loadouts and vendor bundles. */
export function ammoItemIdFor(w: WeaponDefinition): string {
  return w.ammoType;
}
