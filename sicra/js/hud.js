/**
 * In-run overlay: score, coins, multiplier, power-up timers, gesture hints
 * and short toasts. Pure DOM; numbers are only written when they change.
 */

import { t, num } from './i18n.js';
import { POWERUPS } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.score = $('hud-score');
    this.coins = $('hud-coins');
    this.mult = $('hud-mult');
    this.hint = $('hud-hint');
    this.toast = $('hud-toast');
    this.powers = {
      magnet: { el: $('power-magnet'), bar: $('power-magnet-bar') },
      shield: { el: $('power-shield'), bar: $('power-shield-bar') },
      wings: { el: $('power-wings'), bar: $('power-wings-bar') },
    };
    this.lastScore = -1;
    this.lastCoins = -1;
    this.lastMult = -1;
    this.toastTimer = 0;
    this.hintTimer = 0;
  }

  show(visible) {
    this.root.classList.toggle('is-hidden', !visible);
  }

  setHint(text, seconds = 0) {
    this.hint.textContent = text || '';
    this.hint.classList.toggle('is-visible', !!text);
    this.hintTimer = seconds;
  }

  say(text, seconds = 2.2, kind = '') {
    if (!text || seconds <= 0) {
      this.toast.className = 'hud__toast';
      this.toastTimer = 0;
      return;
    }
    this.toast.textContent = text;
    this.toast.className = 'hud__toast is-visible ' + kind;
    this.toastTimer = seconds;
  }

  update(dt, run, player, levels) {
    const score = Math.floor(run.score);
    if (score !== this.lastScore) { this.score.textContent = num(score); this.lastScore = score; }
    if (run.coins !== this.lastCoins) { this.coins.textContent = num(run.coins); this.lastCoins = run.coins; }
    if (run.multiplier !== this.lastMult) {
      this.mult.textContent = t('hud.multiplier', { mult: run.multiplier.toFixed(1).replace(/\.0$/, '') });
      this.lastMult = run.multiplier;
    }
    for (const kind of Object.keys(this.powers)) {
      const left = player.power[kind];
      const ui = this.powers[kind];
      const active = left > 0 || (kind === 'wings' && player.flying);
      ui.el.classList.toggle('is-active', active);
      if (active) {
        const cfg = POWERUPS[kind];
        const total = cfg.base + cfg.perLevel * ((levels[kind] || 1) - 1);
        ui.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / total))})`;
      }
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('is-visible');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.setHint('');
    }
  }
}
