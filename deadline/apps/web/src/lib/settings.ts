'use client';

/** Device-local gameplay preferences, persisted in localStorage. */
export interface GameSettings {
  sensitivity: number;
  invertY: boolean;
  audioEnabled: boolean;
  audioVolume: number;
  showStats: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  invertY: false,
  audioEnabled: true,
  audioVolume: 0.6,
  showStats: false,
};

const KEY = 'deadline.settings.v1';

export function loadSettings(): GameSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: GameSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); preferences simply do not persist.
  }
}
