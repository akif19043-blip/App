import { RaidPhase, type GameConfig } from '@deadline/shared';

export interface MatchCallbacks {
  onPhaseChanged(phase: RaidPhase, previous: RaidPhase): void;
  onCountdownTick(secondsLeft: number): void;
  onRaidStarted(): void;
  onRaidEnded(reason: 'timer' | 'all_resolved'): void;
}

/**
 * Raid state machine: WAITING → COUNTDOWN → ACTIVE → FINAL_PHASE → ENDED.
 *
 * Invalid transitions are rejected rather than silently applied, and the timer
 * is the single source of truth for both the HUD and the MIA rule.
 */
export class MatchSystem {
  private readonly config: GameConfig;
  private readonly callbacks: MatchCallbacks;

  private _phase: RaidPhase = RaidPhase.Waiting;
  private _elapsed = 0;
  private _timeRemaining: number;
  private _countdown = 0;
  private _lobbyWait = 0;
  private lastCountdownAnnounced = -1;

  constructor(config: GameConfig, callbacks: MatchCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this._timeRemaining = config.matchDurationSeconds;
  }

  get phase(): RaidPhase {
    return this._phase;
  }

  get elapsed(): number {
    return this._elapsed;
  }

  get timeRemaining(): number {
    return this._timeRemaining;
  }

  get countdown(): number {
    return this._countdown;
  }

  get lobbyWait(): number {
    return this._lobbyWait;
  }

  private static readonly ALLOWED: Readonly<Record<RaidPhase, readonly RaidPhase[]>> = {
    [RaidPhase.Waiting]: [RaidPhase.Countdown, RaidPhase.Ended],
    [RaidPhase.Countdown]: [RaidPhase.Active, RaidPhase.Waiting, RaidPhase.Ended],
    [RaidPhase.Active]: [RaidPhase.FinalPhase, RaidPhase.Ended],
    [RaidPhase.FinalPhase]: [RaidPhase.Ended],
    [RaidPhase.Ended]: [],
  };

  /** Returns false when the transition is not legal from the current phase. */
  transition(next: RaidPhase): boolean {
    if (next === this._phase) return true;
    if (!MatchSystem.ALLOWED[this._phase].includes(next)) return false;
    const previous = this._phase;
    this._phase = next;
    this.callbacks.onPhaseChanged(next, previous);
    return true;
  }

  /** Called when enough players are present to start the pre-raid countdown. */
  beginCountdown(): boolean {
    if (this._phase !== RaidPhase.Waiting) return false;
    if (!this.transition(RaidPhase.Countdown)) return false;
    this._countdown = this.config.countdownSeconds;
    this.lastCountdownAnnounced = -1;
    return true;
  }

  update(dt: number, readyPlayerCount: number): void {
    switch (this._phase) {
      case RaidPhase.Waiting: {
        this._lobbyWait += dt;
        if (readyPlayerCount >= this.config.minPlayersToStart) {
          const lobbyFull = readyPlayerCount >= this.config.maxPlayers;
          if (lobbyFull || this._lobbyWait >= this.config.lobbyFillSeconds) {
            this.beginCountdown();
          }
        }
        break;
      }

      case RaidPhase.Countdown: {
        this._countdown = Math.max(0, this._countdown - dt);
        const whole = Math.ceil(this._countdown);
        if (whole !== this.lastCountdownAnnounced) {
          this.lastCountdownAnnounced = whole;
          this.callbacks.onCountdownTick(whole);
        }
        if (this._countdown <= 0) {
          this.transition(RaidPhase.Active);
          this.callbacks.onRaidStarted();
        }
        break;
      }

      case RaidPhase.Active: {
        this._elapsed += dt;
        this._timeRemaining = Math.max(0, this.config.matchDurationSeconds - this._elapsed);
        if (this._timeRemaining <= this.config.finalPhaseSeconds) {
          this.transition(RaidPhase.FinalPhase);
        }
        break;
      }

      case RaidPhase.FinalPhase: {
        this._elapsed += dt;
        this._timeRemaining = Math.max(0, this.config.matchDurationSeconds - this._elapsed);
        if (this._timeRemaining <= 0) {
          this.transition(RaidPhase.Ended);
          this.callbacks.onRaidEnded('timer');
        }
        break;
      }

      default:
        break;
    }
  }

  /** Ends the raid early because every player has extracted or died. */
  endEarly(): void {
    if (this._phase === RaidPhase.Ended) return;
    if (this.transition(RaidPhase.Ended)) {
      this.callbacks.onRaidEnded('all_resolved');
    }
  }

  /** Development helper used by the debug panel. */
  setTimeRemaining(seconds: number): void {
    this._timeRemaining = Math.max(0, seconds);
    this._elapsed = Math.max(0, this.config.matchDurationSeconds - this._timeRemaining);
  }

  isRunning(): boolean {
    return this._phase === RaidPhase.Active || this._phase === RaidPhase.FinalPhase;
  }
}
