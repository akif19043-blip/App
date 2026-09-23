import { type Rng } from '../engine/rng';
import { type EnemyKind } from './enemies';

/** Survive this long and the final boss arrives; kill it to win. */
export const RUN_LENGTH = 600;
export const MAX_ENEMIES = 2400;

/** Scheduled bosses. The last one is the final boss. */
export const BOSSES: ReadonlyArray<{ t: number; name: string; hpMult: number; final: boolean }> = [
  { t: 180, name: 'HIVE WARDEN', hpMult: 1, final: false },
  { t: 390, name: 'VOID MATRIARCH', hpMult: 1.8, final: false },
  { t: RUN_LENGTH, name: 'THE OVERMIND', hpMult: 2.6, final: true },
];

/** Encircling swarm events: a ring of enemies closing in from every side. */
export const RING_EVENTS: readonly number[] = [100, 250, 330, 470, 540];

export const ELITE_START = 70;
export const ELITE_INTERVAL = 45;

/** Enemies spawned per second at time t (seconds). Monotonically increasing. */
export function spawnRate(t: number): number {
  const m = Math.max(0, t) / 60;
  return 1.5 + 1.7 * m + 0.2 * m * m;
}

/** Enemy HP multiplier at time t. */
export function hpScale(t: number): number {
  const m = Math.max(0, t) / 60;
  return 1 + 0.25 * m + 0.03 * m * m;
}

/** Enemy contact / bullet damage multiplier at time t. */
export function damageScale(t: number): number {
  return 1 + (Math.max(0, t) / RUN_LENGTH) * 0.6;
}

/** Relative spawn weights for regular enemies; new archetypes phase in over time. */
export function enemyWeights(t: number): Record<'swarmer' | 'grunt' | 'tank' | 'spitter', number> {
  const m = t / 60;
  return {
    swarmer: m < 0.5 ? 0.3 : 1.2 + m * 0.15,
    grunt: 1,
    tank: m < 1.5 ? 0 : Math.min(0.55, 0.12 + (m - 1.5) * 0.09),
    spitter: m < 1 ? 0 : Math.min(0.5, 0.15 + (m - 1) * 0.07),
  };
}

export type SpawnRequest =
  | { type: 'enemy'; kind: EnemyKind }
  | { type: 'ring'; kind: EnemyKind; count: number }
  | { type: 'elite' }
  | { type: 'boss'; name: string; hpMult: number; final: boolean };

/** Decides what spawns and when. Stateless except for its timers. */
export class WaveDirector {
  private spawnAcc = 0;
  private bossIdx = 0;
  private ringIdx = 0;
  private nextElite = ELITE_START;

  constructor(private readonly rng: Rng) {}

  /** Wave number shown in the HUD (one per minute). */
  static waveAt(t: number): number {
    return Math.floor(t / 60) + 1;
  }

  update(dt: number, t: number, alive: number, out: SpawnRequest[]): void {
    out.length = 0;
    // Spawn faster when the screen is sparse so there is never dead time.
    const minAlive = 12 + t * 0.9;
    const boost = alive < minAlive ? 2.5 : 1;
    if (alive < MAX_ENEMIES) this.spawnAcc += spawnRate(t) * boost * dt;
    const w = enemyWeights(t);
    const kinds = ['swarmer', 'grunt', 'tank', 'spitter'] as const;
    const weights = kinds.map((k) => w[k]);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      out.push({ type: 'enemy', kind: kinds[this.rng.weighted(weights)] });
    }
    if (t >= this.nextElite) {
      this.nextElite += ELITE_INTERVAL;
      out.push({ type: 'elite' });
    }
    while (this.ringIdx < RING_EVENTS.length && t >= RING_EVENTS[this.ringIdx]) {
      const count = 28 + this.ringIdx * 10;
      out.push({ type: 'ring', kind: this.ringIdx % 2 === 0 ? 'swarmer' : 'grunt', count });
      this.ringIdx++;
    }
    while (this.bossIdx < BOSSES.length && t >= BOSSES[this.bossIdx].t) {
      const b = BOSSES[this.bossIdx++];
      out.push({ type: 'boss', name: b.name, hpMult: b.hpMult, final: b.final });
    }
  }
}
