/**
 * Menu, shop, missions, settings, pause and game-over screens. The UI never
 * touches the simulation directly: it renders from the profile and calls
 * back into main.js through `handlers`.
 */

import { t, num, apply, LANGUAGES } from './i18n.js';
import { CHARACTERS, UPGRADE_PRICES, POWERUPS, SCORE } from './config.js';
import * as missions from './missions.js';
import { LEVELS } from './quality.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'shop', 'missions', 'settings', 'pause', 'over'];

export class UI {
  /**
   * @param {object} profile    live profile object (mutated by the UI for purchases)
   * @param {object} handlers   { play, resume, quit, retry, revive, menu, select, buy, upgrade,
   *                              setting(key, value), reset, click }
   */
  constructor(profile, handlers) {
    this.profile = profile;
    this.h = handlers;
    this.current = null;
    this.toastTimer = 0;

    const on = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); this.h.click?.(); fn(e); });
    on('btn-play', () => this.h.play());
    on('btn-shop', () => this.show('shop'));
    on('btn-missions', () => this.show('missions'));
    on('btn-settings', () => this.show('settings'));
    on('btn-shop-back', () => this.show('menu'));
    on('btn-missions-back', () => this.show('menu'));
    on('btn-settings-back', () => this.show('menu'));
    on('btn-resume', () => this.h.resume());
    on('btn-quit', () => this.h.quit());
    on('btn-retry', () => this.h.retry());
    on('btn-over-menu', () => this.h.menu());
    on('btn-revive', () => this.h.revive());
    on('btn-reset', () => { if (window.confirm(t('settings.resetConfirm'))) this.h.reset(); });
    $('btn-pause').addEventListener('click', (e) => { e.preventDefault(); this.h.pause(); });

    // settings widgets
    const lang = $('set-language');
    for (const { code, label } of LANGUAGES) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = label;
      lang.appendChild(opt);
    }
    lang.addEventListener('change', () => this.h.setting('language', lang.value));
    $('set-quality').addEventListener('change', (e) => this.h.setting('quality', e.target.value));
    for (const key of ['sound', 'music', 'vibrate']) {
      const el = $('set-' + key);
      el.addEventListener('click', () => {
        const next = el.getAttribute('aria-pressed') !== 'true';
        this.h.setting(key, next);
        this.renderSettings();
      });
    }
  }

  /** Switch to a screen (or null for none: the run itself). */
  show(name) {
    for (const s of SCREENS) $('screen-' + s).classList.toggle('is-hidden', s !== name);
    this.current = name;
    if (name === 'menu') this.renderMenu();
    if (name === 'shop') this.renderShop();
    if (name === 'missions') this.renderMissions();
    if (name === 'settings') this.renderSettings();
  }

  /** Re-translate everything after a language change. */
  retranslate() {
    apply();
    if (this.current) this.show(this.current);
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1800);
  }

  renderMenu() {
    $('menu-best').textContent = num(this.profile.best);
    $('menu-coins').innerHTML = '<i class="coin"></i>' + num(this.profile.coins);
  }

  renderShop() {
    const p = this.profile;
    $('shop-coins').textContent = num(p.coins);
    const grid = $('shop-characters');
    grid.innerHTML = '';
    for (const c of CHARACTERS) {
      const owned = p.owned.includes(c.id);
      const selected = p.character === c.id;
      const card = document.createElement('div');
      card.className = 'card' + (selected ? ' is-selected' : '');
      card.dataset.id = c.id;
      const hex = (v) => '#' + v.toString(16).padStart(6, '0');
      card.innerHTML = `
        <div class="card__swatch" style="background: linear-gradient(180deg, ${hex(c.hatColor)}33, ${hex(c.shirt)}55)">
          <div class="card__figure" style="background:${hex(c.shirt)}; --skin:${hex(c.skin)}; --pants:${hex(c.pants)}"></div>
        </div>
        <div class="card__name">${t('char.' + c.id)}</div>
        <div class="card__desc">${t('char.' + c.id + '.desc')}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button' + (selected ? '' : owned ? ' button--primary' : '');
      if (selected) {
        btn.textContent = t('shop.selected');
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = t('shop.select');
        btn.addEventListener('click', () => { this.h.click?.(); this.h.select(c.id); this.renderShop(); });
      } else {
        btn.innerHTML = `${t('shop.buy')} · <i class="coin"></i>${num(c.price)}`;
        btn.addEventListener('click', () => {
          this.h.click?.();
          if (p.coins < c.price) { this.toast(t('shop.tooPoor')); return; }
          this.h.buy(c.id);
          this.toast(t('shop.bought', { name: t('char.' + c.id) }));
          this.renderShop();
        });
      }
      card.appendChild(btn);
      grid.appendChild(card);
    }

    const list = $('shop-upgrades');
    list.innerHTML = '';
    const icons = { magnet: 'U', shield: '◈', wings: '⋀' };
    for (const kind of ['magnet', 'shield', 'wings']) {
      const level = p.upgrades[kind] || 1;
      const max = POWERUPS.maxLevel;
      const cfg = POWERUPS[kind];
      const seconds = (cfg.base + cfg.perLevel * (level - 1)).toFixed(1).replace(/\.0$/, '');
      const row = document.createElement('div');
      row.className = 'upgrade upgrade--' + kind;
      row.dataset.kind = kind;
      const pips = Array.from({ length: max }, (_, i) => `<span class="pip${i < level ? ' is-on' : ''}"></span>`).join('');
      row.innerHTML = `
        <div class="upgrade__icon">${icons[kind]}</div>
        <div>
          <div class="upgrade__title">${t('power.' + kind)} · <span class="upgrade__meta">${t('shop.level', { level })} · ${t('shop.seconds', { s: seconds })}</span></div>
          <div class="upgrade__meta">${t('power.' + kind + '.desc')}</div>
          <div class="upgrade__pips">${pips}</div>
        </div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button';
      if (level >= max) {
        btn.textContent = t('shop.max');
        btn.disabled = true;
      } else {
        const price = UPGRADE_PRICES[level];
        btn.innerHTML = `<i class="coin"></i>${num(price)}`;
        btn.addEventListener('click', () => {
          this.h.click?.();
          if (p.coins < price) { this.toast(t('shop.tooPoor')); return; }
          this.h.upgrade(kind);
          this.toast(t('shop.upgraded', { name: t('power.' + kind) }));
          this.renderShop();
        });
      }
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  renderMissions() {
    const p = this.profile;
    missions.ensure(p);
    const mult = missions.multiplierFor(p.missions.completedSets || 0);
    $('missions-mult').textContent = t('hud.multiplier', { mult: mult.toFixed(1).replace(/\.0$/, '') });
    const list = $('missions-list');
    list.innerHTML = '';
    for (const m of p.missions.active) {
      const el = document.createElement('div');
      el.className = 'mission' + (m.done ? ' is-done' : '');
      const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
      el.innerHTML = `
        <div class="mission__top">
          <span>${t('mission.' + m.type, { n: num(m.target) })}</span>
          <span class="mission__reward"><i class="coin"></i>${t('missions.reward', { coins: missions.reward(m) })}</span>
        </div>
        <div class="mission__track"><div class="mission__bar" style="width:${pct}%"></div></div>
        <div class="mission__meta">${num(Math.min(m.progress, m.target))} / ${num(m.target)}</div>`;
      list.appendChild(el);
    }
  }

  renderSettings() {
    const s = this.profile.settings;
    $('set-language').value = s.language || document.documentElement.lang;
    $('set-quality').value = LEVELS.some((l) => l.id === s.quality) ? s.quality : 'high';
    for (const key of ['sound', 'music', 'vibrate']) {
      $('set-' + key).setAttribute('aria-pressed', s[key] ? 'true' : 'false');
    }
    $('settings-stats').textContent = t('settings.stats', {
      runs: num(this.profile.runs), distance: num(this.profile.totalDistance), coins: num(this.profile.totalCoins),
    });
  }

  /** Fill the game-over dialog. */
  renderOver(run, how, canRevive, cost) {
    $('over-title').textContent = t(how === 'fell' ? 'over.fell' : 'over.title');
    $('over-score').textContent = num(run.score);
    $('over-distance').textContent = num(run.distance) + ' m';
    $('over-coins').textContent = num(run.coins);
    $('over-best').textContent = num(this.profile.best);
    $('over-newbest').classList.toggle('is-hidden', !run.newBest);
    const btn = $('btn-revive');
    btn.classList.toggle('is-hidden', !canRevive);
    btn.disabled = this.profile.coins < cost;
    $('revive-cost').textContent = t('over.reviveCost', { cost });
  }
}

export { SCORE };
