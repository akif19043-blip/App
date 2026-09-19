import { Rarity } from '@deadline/shared';

/**
 * DEADLINE visual identity.
 *
 * A cold, near-black industrial palette with a single hot signal colour.
 * These tokens are the source of truth; the web app mirrors them into CSS
 * custom properties so both TS and CSS agree.
 */
export const COLORS = {
  background: '#07090D',
  surface: '#11151C',
  surfaceRaised: '#181E28',
  border: '#232C39',
  primary: '#FF4438',
  warning: '#FFB020',
  success: '#34D399',
  text: '#E6EAF2',
  textMuted: '#8A94A6',
} as const;

export const RARITY_COLORS: Readonly<Record<Rarity, string>> = {
  [Rarity.Common]: '#8A94A6',
  [Rarity.Uncommon]: '#34D399',
  [Rarity.Rare]: '#3B82F6',
  [Rarity.Epic]: '#A855F7',
  [Rarity.Legendary]: '#F59E0B',
};

export function rarityColor(rarity: string): string {
  return RARITY_COLORS[rarity as Rarity] ?? COLORS.textMuted;
}

/** Tailwind-friendly class fragments for rarity-tinted borders. */
export const RARITY_BORDER: Readonly<Record<Rarity, string>> = {
  [Rarity.Common]: 'border-slate-600',
  [Rarity.Uncommon]: 'border-emerald-500',
  [Rarity.Rare]: 'border-blue-500',
  [Rarity.Epic]: 'border-purple-500',
  [Rarity.Legendary]: 'border-amber-500',
};
