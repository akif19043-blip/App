/**
 * Analytics event abstraction.
 *
 * Nothing is wired to a vendor yet: the default sink logs structured JSON. A
 * provider is attached later with {@link setAnalyticsSink} without touching any
 * call site.
 */
export const AnalyticsEvent = {
  AccountCreated: 'account_created',
  RaidStarted: 'raid_started',
  RaidFinished: 'raid_finished',
  PlayerDied: 'player_died',
  PlayerExtracted: 'player_extracted',
  ItemLooted: 'item_looted',
  MarketPurchase: 'market_purchase',
  MarketSale: 'market_sale',
  MissionCompleted: 'mission_completed',
} as const;
export type AnalyticsEvent = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export interface AnalyticsSink {
  track(event: AnalyticsEvent, properties: AnalyticsProperties): void;
}

function analyticsDebugEnabled(): boolean {
  const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return globalProcess?.env?.['ANALYTICS_DEBUG'] === 'true';
}

const consoleSink: AnalyticsSink = {
  track(event, properties) {
    if (!analyticsDebugEnabled()) return;
    console.log(JSON.stringify({ kind: 'analytics', event, properties }));
  },
};

let sink: AnalyticsSink = consoleSink;

export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
  try {
    sink.track(event, properties);
  } catch {
    // Analytics must never break gameplay.
  }
}
