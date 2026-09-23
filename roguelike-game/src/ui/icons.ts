import { type MetaId } from '../game/meta';
import { type PassiveId } from '../game/upgrades';
import { type WeaponId } from '../weapons/defs';

/**
 * Crisp inline-SVG icon set (24x24, currentColor). Replaces unicode glyphs,
 * which render differently on every OS and blur at small sizes.
 */
const P: Record<string, string> = {
  // weapons
  wand: '<path d="M4 20 13.5 10.5" stroke-width="2.6"/><path fill="currentColor" stroke="none" d="m16.5 2 1.3 3.7L21.5 7l-3.7 1.3-1.3 3.7-1.3-3.7L11.5 7l3.7-1.3z"/><circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="19.5" cy="15" r="1" fill="currentColor" stroke="none"/>',
  orbs: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3" opacity=".6"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="19.2" cy="8.6" r="2.4" fill="currentColor" stroke="none"/><circle cx="4.8" cy="15.4" r="2.4" fill="currentColor" stroke="none"/>',
  lightning: '<path fill="currentColor" stroke="none" d="M13.5 1.5 4 13.5h6.5L8.5 22.5 19.5 9.5H13z"/>',
  daggers: '<path fill="currentColor" stroke="none" d="M21 3 10.5 11.5l2 2z"/><path d="m8 10 6 6M10 14l-5.5 5.5" stroke-width="2.4"/><path d="M3.5 9.5c1-3 3.5-5 6.5-5.5" opacity=".7" stroke-dasharray="2 2.2"/>',
  aura: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10" opacity=".45"/>',
  // passives
  might: '<path fill="currentColor" stroke="none" d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>',
  haste: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/><path fill="currentColor" stroke="none" d="M9 19h6l-3-3z"/>',
  swift: '<path d="m4 6 6 6-6 6M12 6l6 6-6 6" stroke-width="2.6"/>',
  vitality: '<path fill="currentColor" stroke="none" d="M12 21s-8.5-5.4-8.5-11.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8.5 2.7C20.5 15.6 12 21 12 21z"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3" stroke-width="3.2"/><path d="M4.4 6.5h3.2M16.4 6.5h3.2" stroke="#06050d" stroke-width="1.6"/>',
  area: '<path d="M12 2 22 12 12 22 2 12z"/><path fill="currentColor" stroke="none" d="m12 7.5 4.5 4.5-4.5 4.5L7.5 12z"/>',
  multishot: '<path d="M4 20 20 4M4 20l8-16M4 20l16-8" stroke-width="2.2"/><circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none"/>',
  regen: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v10M7 12h10" stroke-width="3"/>',
  armor: '<path fill="currentColor" fill-opacity=".25" d="M12 2.5 19.5 5.5v6c0 5-3.3 8.6-7.5 10.5-4.2-1.9-7.5-5.5-7.5-10.5v-6z"/><path d="M12 7v10" opacity=".7"/>',
  crit: '<circle cx="12" cy="12" r="7"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  growth: '<path fill="currentColor" stroke="none" d="m12 2.5 8 8.5h-4.5v10h-7V11H4z"/>',
  velocity: '<path d="M2.5 12h13" stroke-width="2.6"/><path fill="currentColor" stroke="none" d="m13 5.5 9 6.5-9 6.5z"/><path d="M4 7.5h5M4 16.5h5" opacity=".6"/>',
  // misc
  heart: '<path fill="currentColor" stroke="none" d="M12 21s-8.5-5.4-8.5-11.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8.5 2.7C20.5 15.6 12 21 12 21z"/>',
  coin: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".25"/><path d="M14.8 8.6c-.6-.9-1.6-1.3-2.8-1.3-1.7 0-2.9.9-2.9 2.2 0 3 6 1.6 6 4.8 0 1.3-1.3 2.4-3.1 2.4-1.3 0-2.4-.5-3-1.4M12 5.5v13"/>',
  skull: '<path fill="currentColor" fill-opacity=".25" d="M12 2.5c-4.7 0-8 3.3-8 7.6 0 2.6 1.2 4.4 3 5.4V19h10v-3.5c1.8-1 3-2.8 3-5.4 0-4.3-3.3-7.6-8-7.6z"/><circle cx="8.8" cy="10.5" r="2" fill="currentColor" stroke="none"/><circle cx="15.2" cy="10.5" r="2" fill="currentColor" stroke="none"/><path d="M10 19v2.5M14 19v2.5"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.2"/>',
  reroll: '<path d="M20 12a8 8 0 1 1-2.4-5.7" stroke-width="2.4"/><path fill="currentColor" stroke="none" d="M21 3v7h-7z"/>',
  play: '<path fill="currentColor" stroke="none" d="M7 4v16l13-8z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H3.5c0 3 1.5 5 4 5.3M17 6h3.5c0 3-1.5 5-4 5.3M12 14v4M8 21h8M9.5 18h5"/>',
};

const META_ICON: Record<MetaId, string> = {
  maxHp: 'vitality', speed: 'swift', magnet: 'magnet', might: 'might',
  armor: 'armor', growth: 'growth', greed: 'coin', reroll: 'reroll',
};

export function icon(name: string, cls = 'ico'): string {
  const body = P[name] ?? P.might;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const weaponIcon = (id: WeaponId, cls?: string) => icon(id, cls);
export const passiveIcon = (id: PassiveId, cls?: string) => icon(id, cls);
export const metaIcon = (id: MetaId, cls?: string) => icon(META_ICON[id], cls);
