import type {
  AnnouncementPayload,
  PlayerRaidState,
  RaidPhase,
  RaidSummary,
  SerializedInventory,
} from '@deadline/shared';

/**
 * HUD state store.
 *
 * The render loop runs at 60 FPS on `requestAnimationFrame` and must never
 * trigger a React render. Instead it writes into this plain object and flushes
 * a *snapshot* to subscribers at a fixed, low rate. React reads the snapshot
 * through `useSyncExternalStore`, so the UI updates ~12 times a second while
 * the game keeps its own frame budget.
 */
export interface ContainerPrompt {
  containerId: string;
  label: string;
  distance: number;
  locked: boolean;
}

export interface LootOffer {
  containerId: string;
  items: { worldItemId: string; itemId: string; quantity: number }[];
}

export interface KillFeedEntry {
  id: string;
  text: string;
  at: number;
}

export interface DamageIndicator {
  id: string;
  angle: number;
  at: number;
}

export interface HudSnapshot {
  connected: boolean;
  connectionError: string | null;
  phase: RaidPhase | 'connecting';
  timeRemaining: number;
  countdown: number;
  raidState: PlayerRaidState | 'DEPLOYING';

  health: number;
  armor: number;
  stamina: number;
  weaponName: string;
  weaponId: string;
  ammoInMag: number;
  magazineSize: number;
  reserveAmmo: number;
  reloading: boolean;

  kills: number;
  aiKills: number;
  damageDealt: number;
  alivePlayers: number;

  extractionProgress: number;
  extractionPointId: string | null;
  assignedExtractions: { id: string; name: string; distance: number; bearing: number }[];

  prompt: ContainerPrompt | null;
  lootOffer: LootOffer | null;
  inventory: { backpack: SerializedInventory | null; secure: SerializedInventory | null };
  backpackValue: number;

  announcements: AnnouncementPayload[];
  killFeed: KillFeedEntry[];
  damageIndicators: DamageIndicator[];
  hitMarkerAt: number;
  headshotMarker: boolean;

  compassHeading: number;
  fps: number;
  quality: 'high' | 'medium' | 'low';
  ping: number;
  summary: RaidSummary | null;
  debugEnabled: boolean;
  showDebugPanel: boolean;
}

function initialSnapshot(): HudSnapshot {
  return {
    connected: false,
    connectionError: null,
    phase: 'connecting',
    timeRemaining: 0,
    countdown: 0,
    raidState: 'DEPLOYING',
    health: 100,
    armor: 0,
    stamina: 100,
    weaponName: '—',
    weaponId: '',
    ammoInMag: 0,
    magazineSize: 0,
    reserveAmmo: 0,
    reloading: false,
    kills: 0,
    aiKills: 0,
    damageDealt: 0,
    alivePlayers: 0,
    extractionProgress: 0,
    extractionPointId: null,
    assignedExtractions: [],
    prompt: null,
    lootOffer: null,
    inventory: { backpack: null, secure: null },
    backpackValue: 0,
    announcements: [],
    killFeed: [],
    damageIndicators: [],
    hitMarkerAt: 0,
    headshotMarker: false,
    compassHeading: 0,
    fps: 0,
    quality: 'high',
    ping: 0,
    summary: null,
    debugEnabled: false,
    showDebugPanel: false,
  };
}

type Listener = () => void;

export class HudStore {
  private snapshot: HudSnapshot = initialSnapshot();
  private draft: HudSnapshot = initialSnapshot();
  private listeners = new Set<Listener>();
  private dirty = false;
  private lastFlush = 0;
  /** Minimum milliseconds between React notifications. */
  private readonly flushInterval = 80;

  getSnapshot = (): HudSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Mutate the draft from the game loop; cheap, never notifies React. */
  patch(values: Partial<HudSnapshot>): void {
    Object.assign(this.draft, values);
    this.dirty = true;
  }

  /** Force the next flush to happen immediately (used for critical events). */
  flushNow(): void {
    this.lastFlush = 0;
    this.flush(performance.now());
  }

  /** Called once per frame; publishes at most every `flushInterval` ms. */
  flush(now: number): void {
    if (!this.dirty) return;
    if (now - this.lastFlush < this.flushInterval) return;
    this.lastFlush = now;
    this.dirty = false;
    this.snapshot = { ...this.draft };
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.draft = initialSnapshot();
    this.snapshot = initialSnapshot();
    for (const listener of this.listeners) listener();
  }

  get current(): HudSnapshot {
    return this.draft;
  }

  pushAnnouncement(announcement: AnnouncementPayload): void {
    const next = [...this.draft.announcements.slice(-2), announcement];
    this.patch({ announcements: next });
    this.flushNow();
  }

  pushKillFeed(text: string): void {
    const entry: KillFeedEntry = { id: `${Date.now()}_${Math.random()}`, text, at: Date.now() };
    this.patch({ killFeed: [...this.draft.killFeed.slice(-5), entry] });
    this.flushNow();
  }

  pushDamageIndicator(angle: number): void {
    const entry: DamageIndicator = { id: `${Date.now()}_${Math.random()}`, angle, at: Date.now() };
    this.patch({ damageIndicators: [...this.draft.damageIndicators.slice(-4), entry] });
    this.flushNow();
  }

  /** Drops announcements, kill-feed rows and hit indicators that have expired. */
  expire(now: number): void {
    const announcements = this.draft.announcements.filter(
      (item) => now - Number(item.id) < item.durationMs,
    );
    const killFeed = this.draft.killFeed.filter((item) => now - item.at < 7_000);
    const damageIndicators = this.draft.damageIndicators.filter((item) => now - item.at < 1_400);
    if (
      announcements.length !== this.draft.announcements.length ||
      killFeed.length !== this.draft.killFeed.length ||
      damageIndicators.length !== this.draft.damageIndicators.length
    ) {
      this.patch({ announcements, killFeed, damageIndicators });
    }
  }
}

export const hudStore = new HudStore();
