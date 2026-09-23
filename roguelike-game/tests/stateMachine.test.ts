import { describe, expect, it } from 'vitest';
import { StateMachine, TRANSITIONS } from '../src/engine/stateMachine';

describe('StateMachine', () => {
  it('follows the menu -> game -> level up -> game over flow', () => {
    const sm = new StateMachine('menu');
    const log: string[] = [];
    sm.on('playing', { enter: (from) => log.push(`enter playing from ${from}`), exit: (to) => log.push(`exit playing to ${to}`) });
    sm.onChange((to, from) => log.push(`${from}->${to}`));
    sm.go('playing');
    sm.go('levelup');
    sm.go('levelup'); // chained level-ups
    sm.go('playing');
    sm.go('gameover');
    sm.go('playing'); // retry
    expect(sm.state).toBe('playing');
    expect(log).toContain('enter playing from menu');
    expect(log).toContain('exit playing to levelup');
    expect(log).toContain('levelup->levelup');
  });

  it('rejects illegal transitions', () => {
    const sm = new StateMachine('menu');
    expect(sm.can('gameover')).toBe(false);
    expect(() => sm.go('gameover')).toThrow(/Illegal/);
    expect(sm.state).toBe('menu');
    sm.go('shop');
    expect(() => sm.go('playing')).toThrow();
  });

  it('every state can eventually return to the menu', () => {
    for (const s of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      const seen = new Set([s]);
      const queue = [s];
      while (queue.length) for (const n of TRANSITIONS[queue.shift()!]) if (!seen.has(n)) seen.add(n), queue.push(n);
      expect(seen.has('menu')).toBe(true);
    }
  });
});
