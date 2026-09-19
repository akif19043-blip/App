'use client';

import { useSyncExternalStore } from 'react';
import { hudStore, type HudSnapshot } from '@/game/store';

/**
 * Subscribe React to the game's HUD store.
 *
 * The store publishes a new immutable snapshot at ~12 Hz, so the HUD re-renders
 * at a human-readable rate while the game keeps rendering at 60 FPS.
 */
export function useHud(): HudSnapshot {
  return useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot, hudStore.getSnapshot);
}
