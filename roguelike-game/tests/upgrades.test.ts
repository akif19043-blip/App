import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { PASSIVES, candidateCards, rollCards } from '../src/game/upgrades';
import { MAX_WEAPONS, MAX_WEAPON_LEVEL, WEAPON_IDS } from '../src/weapons/defs';

describe('level-up cards', () => {
  it('offers three distinct cards', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      const cards = rollCards({ weapons: [{ id: 'wand', level: 1 }], passives: {} }, rng);
      expect(cards).toHaveLength(3);
      const keys = cards.map((c) => `${c.kind}:${'id' in c ? c.id : ''}`);
      expect(new Set(keys).size).toBe(3);
    }
  });

  it('never offers new weapons once all slots are full', () => {
    const weapons = WEAPON_IDS.slice(0, MAX_WEAPONS).map((id) => ({ id, level: 1 }));
    const cands = candidateCards({ weapons, passives: {} });
    const newOnes = cands.filter((c) => c.card.kind === 'weapon' && c.card.level === 1);
    expect(newOnes).toHaveLength(0);
  });

  it('offers the next level with that level\'s description', () => {
    const cands = candidateCards({ weapons: [{ id: 'wand', level: 3 }], passives: {} });
    const up = cands.find((c) => c.card.kind === 'weapon' && c.card.id === 'wand')!.card;
    expect(up.level).toBe(4);
    expect(up.desc).toBe('-15% cooldown');
  });

  it('skips maxed weapons and passives', () => {
    const passives = Object.fromEntries(PASSIVES.map((p) => [p.id, p.maxRank]));
    const cands = candidateCards({ weapons: [{ id: 'wand', level: MAX_WEAPON_LEVEL }], passives });
    expect(cands.every((c) => c.card.kind === 'weapon' && c.card.level === 1)).toBe(true);
  });

  it('falls back to heal / gold when everything is maxed', () => {
    const passives = Object.fromEntries(PASSIVES.map((p) => [p.id, p.maxRank]));
    const weapons = WEAPON_IDS.slice(0, MAX_WEAPONS).map((id) => ({ id, level: MAX_WEAPON_LEVEL }));
    const cards = rollCards({ weapons, passives }, new Rng(1));
    expect(cards.map((c) => c.kind)).toEqual(['heal', 'gold']);
  });
});
