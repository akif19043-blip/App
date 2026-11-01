/**
 * Upgrade icons: tiny inline SVGs, drawn in currentColor so a card can tint
 * them. No image files to load, and they stay sharp at any size.
 */

const PATHS = {
  // weapons
  spark: '<path d="M4 20 L14 10"/><path d="M14 4 L15.5 8.5 L20 10 L15.5 11.5 L14 16 L12.5 11.5 L8 10 L12.5 8.5 Z" fill="currentColor"/>',
  halo: '<circle cx="12" cy="12" r="7" stroke-dasharray="3 3"/><circle cx="12" cy="5" r="2.2" fill="currentColor"/><circle cx="18" cy="15.5" r="2.2" fill="currentColor"/><circle cx="6" cy="15.5" r="2.2" fill="currentColor"/>',
  pulse: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5" opacity="0.5"/>',
  arc: '<path d="M13 2 L6 13 H11 L9 22 L18 9 H13 Z" fill="currentColor"/>',
  embers: '<path d="M12 3 C15 7 18 9 18 14 A6 6 0 0 1 6 14 C6 10 9 9 9 6 C10.5 8 11 9 12 3 Z" fill="currentColor"/>',
  // passives
  wings: '<path d="M12 12 C8 4 3 5 3 9 C3 13 8 13 12 12 Z" fill="currentColor"/><path d="M12 12 C16 4 21 5 21 9 C21 13 16 13 12 12 Z" fill="currentColor"/><path d="M12 12 C9 15 6 19 9 20 C11 20 12 16 12 12 Z" fill="currentColor" opacity="0.6"/><path d="M12 12 C15 15 18 19 15 20 C13 20 12 16 12 12 Z" fill="currentColor" opacity="0.6"/>',
  glow: '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M5 5 L7 7 M17 17 L19 19 M19 5 L17 7 M5 19 L7 17"/>',
  shell: '<path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z" fill="currentColor" opacity="0.85"/>',
  nectar: '<path d="M12 3 C12 3 6 10 6 14 A6 6 0 0 0 18 14 C18 10 12 3 12 3 Z" fill="currentColor"/>',
  focus: '<circle cx="12" cy="12" r="8"/><path d="M12 7 V12 L15.5 14"/>',
  bright: '<circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="12" cy="12" r="9" opacity="0.45"/>',
  reach: '<path d="M4 12 H20 M4 12 L8 8 M4 12 L8 16 M20 12 L16 8 M20 12 L16 16"/>',
  honey: '<path d="M7 9 H17 L16 19 C16 20 15 21 14 21 H10 C9 21 8 20 8 19 Z" fill="currentColor"/><path d="M9 9 C9 6 15 6 15 9"/>',
  // shop
  vitality: '<path d="M12 20 C5 15 3 11 3 8 A4.5 4.5 0 0 1 12 6 A4.5 4.5 0 0 1 21 8 C21 11 19 15 12 20 Z" fill="currentColor"/>',
  power: '<path d="M13 2 L6 13 H11 L9 22 L18 9 H13 Z" fill="currentColor"/>',
  swiftness: '<path d="M3 8 H13 M5 12 H17 M3 16 H13"/><path d="M15 6 L21 12 L15 18"/>',
  magnetism: '<path d="M6 4 V12 A6 6 0 0 0 18 12 V4 H14 V12 A2 2 0 0 1 10 12 V4 Z" fill="currentColor"/>',
  greed: '<circle cx="12" cy="12" r="8" fill="currentColor"/><path d="M12 7 V17 M9.5 9.5 C9.5 8 14.5 8 14.5 10 C14.5 12 9.5 12 9.5 14 C9.5 16 14.5 16 14.5 14.5" stroke="#1a1030"/>',
  vigor: '<path d="M3 12 H7 L9 7 L13 17 L15 12 H21"/>',
};

export function icon(id) {
  const body = PATHS[id] || '<circle cx="12" cy="12" r="6"/>';
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
