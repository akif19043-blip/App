import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import {
  BOSSES, ELITE_INTERVAL, ELITE_START, MAX_ENEMIES, RUN_LENGTH, type SpawnRequest, WaveDirector,
  damageScale, enemyWeights, hpScale, spawnRate,
} from '../src/game/waves';

describe('wave pacing', () => {
  it('ramps spawn rate and enemy HP over time', () => {
    for (let t = 0; t < RUN_LENGTH; t += 10) {
      expect(spawnRate(t + 10)).toBeGreaterThan(spawnRate(t));
      expect(hpScale(t + 10)).toBeGreaterThan(hpScale(t));
      expect(damageScale(t + 10)).toBeGreaterThanOrEqual(damageScale(t));
    }
    expect(hpScale(0)).toBe(1);
  });

  it('phases in tougher archetypes', () => {
    expect(enemyWeights(10).tank).toBe(0);
    expect(enemyWeights(10).spitter).toBe(0);
    expect(enemyWeights(240).tank).toBeGreaterThan(0);
    expect(enemyWeights(240).spitter).toBeGreaterThan(0);
  });

  it('schedules elites, bosses and the final boss exactly once', () => {
    const d = new WaveDirector(new Rng(1));
    const out: SpawnRequest[] = [];
    const seen: SpawnRequest[] = [];
    const dt = 1 / 60;
    for (let t = 0; t <= RUN_LENGTH + 1; t += dt) {
      d.update(dt, t, 100, out);
      seen.push(...out);
    }
    const bosses = seen.filter((s) => s.type === 'boss');
    expect(bosses.map((b) => (b.type === 'boss' ? b.name : ''))).toEqual(BOSSES.map((b) => b.name));
    expect(bosses.filter((b) => b.type === 'boss' && b.final)).toHaveLength(1);
    const elites = seen.filter((s) => s.type === 'elite').length;
    expect(elites).toBe(Math.floor((RUN_LENGTH + 1 - ELITE_START) / ELITE_INTERVAL) + 1);
    expect(seen.filter((s) => s.type === 'enemy').length).toBeGreaterThan(1000);
  });

  it('stops regular spawns at the enemy cap', () => {
    const d = new WaveDirector(new Rng(1));
    const out: SpawnRequest[] = [];
    let spawned = 0;
    for (let i = 0; i < 600; i++) {
      d.update(1 / 60, 30, MAX_ENEMIES, out);
      spawned += out.filter((s) => s.type === 'enemy').length;
    }
    expect(spawned).toBe(0);
  });

  it('numbers waves by minute', () => {
    expect(WaveDirector.waveAt(0)).toBe(1);
    expect(WaveDirector.waveAt(59.9)).toBe(1);
    expect(WaveDirector.waveAt(60)).toBe(2);
  });
});
