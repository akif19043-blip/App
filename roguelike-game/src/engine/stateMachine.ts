/**
 * Minimal finite state machine with an explicit transition table and
 * enter/exit hooks. Illegal transitions throw so bugs surface immediately.
 */
export type GameState = 'menu' | 'shop' | 'playing' | 'levelup' | 'paused' | 'gameover' | 'victory';

export const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  menu: ['playing', 'shop'],
  shop: ['menu'],
  playing: ['levelup', 'paused', 'gameover', 'victory', 'menu'],
  levelup: ['playing', 'levelup'],
  paused: ['playing', 'menu'],
  gameover: ['playing', 'menu'],
  victory: ['playing', 'menu'],
};

export interface StateHooks {
  enter?(from: GameState | null): void;
  exit?(to: GameState): void;
}

export class StateMachine {
  private current: GameState;
  private readonly hooks = new Map<GameState, StateHooks>();
  private readonly listeners: Array<(to: GameState, from: GameState) => void> = [];

  constructor(initial: GameState) {
    this.current = initial;
  }

  get state(): GameState {
    return this.current;
  }

  on(state: GameState, hooks: StateHooks): this {
    this.hooks.set(state, hooks);
    return this;
  }

  onChange(fn: (to: GameState, from: GameState) => void): void {
    this.listeners.push(fn);
  }

  can(to: GameState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  go(to: GameState): void {
    const from = this.current;
    if (!this.can(to)) throw new Error(`Illegal state transition ${from} -> ${to}`);
    this.hooks.get(from)?.exit?.(to);
    this.current = to;
    this.hooks.get(to)?.enter?.(from);
    for (const fn of this.listeners) fn(to, from);
  }
}
