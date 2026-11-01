/**
 * Every DOM read and write. The game decides what a button means; this
 * module only draws screens and reports taps through `handlers`.
 */

import * as audio from './audio.js';
import * as save from './save.js';
import { icon } from './icons.js';
import { t, apply, language, setLanguage, LANGUAGES } from './i18n.js';
import { DAWN, META, MAX_LEVEL } from './config.js';

const SCREENS = ['title', 'level', 'pause', 'over', 'shop', 'settings'];

export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function number(value) {
  return Math.round(value).toLocaleString('en-US');
}

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.current = null;
    this.screens = {};
    for (const name of SCREENS) this.screens[name] = $('screen-' + name);
    this.hudEl = $('hud');
    this.last = {};
    this.bind();
    this.buildLanguages();
    this.syncToggles();
  }

  bind() {
    const tap = (id, fn) => {
      $(id).addEventListener('click', (event) => {
        event.preventDefault();
        audio.unlock();
        audio.sfx.click();
        fn();
      });
    };
    tap('btn-play', () => this.handlers.play());
    tap('btn-shop', () => this.showShop());
    tap('btn-settings', () => this.show('settings'));
    tap('btn-settings-back', () => this.handlers.back());
    tap('btn-shop-back', () => this.handlers.back());
    tap('btn-free-gold', () => this.handlers.freeGold());
    tap('btn-pause', () => this.handlers.pause());
    tap('btn-resume', () => this.handlers.resume());
    tap('btn-quit', () => this.handlers.quit());
    tap('btn-reroll', () => this.handlers.reroll());
    tap('btn-revive', () => this.handlers.revive());
    tap('btn-double', () => this.handlers.double());
    tap('btn-again', () => this.handlers.play());
    tap('btn-menu', () => this.handlers.menu());

    document.querySelectorAll('[data-setting]').forEach((box) => {
      box.addEventListener('change', () => {
        save.setSetting(box.dataset.setting, box.checked);
        this.syncToggles();
        this.handlers.settings();
      });
    });

    // Number keys pick a level-up card, so a keyboard player never needs
    // the mouse.
    window.addEventListener('keydown', (event) => {
      if (this.current !== 'level') return;
      const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
      if (index >= 0 && this.choices && this.choices[index]) this.handlers.choose(index);
    });
  }

  syncToggles() {
    const settings = save.get().settings;
    document.querySelectorAll('[data-setting]').forEach((box) => {
      box.checked = !!settings[box.dataset.setting];
    });
  }

  buildLanguages() {
    const host = $('languages');
    host.innerHTML = '';
    for (const entry of LANGUAGES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lang' + (entry.code === language() ? ' is-on' : '');
      button.textContent = entry.label;
      button.addEventListener('click', () => {
        audio.sfx.click();
        save.setSetting('language', setLanguage(entry.code));
        apply();
        this.buildLanguages();
        this.handlers.settings();
      });
      host.appendChild(button);
    }
  }

  /** @param {string|null} name a screen, or null for the bare game */
  show(name) {
    for (const key of SCREENS) this.screens[key].classList.toggle('is-visible', key === name);
    this.hudEl.classList.toggle('is-visible', name === null || name === 'level' || name === 'pause');
    this.current = name;
    if (name === 'settings' || name === 'pause') this.syncToggles();
  }

  // ------------------------------------------------------------ title --

  refreshTitle({ adsAvailable, freeGoldReady, freeGold }) {
    const profile = save.get();
    $('title-best').textContent = profile.best ? clock(profile.best) : t('title.bestNone');
    $('title-dawns').textContent = number(profile.dawns);
    $('title-gold').textContent = number(profile.gold);
    const offer = $('btn-free-gold');
    offer.classList.toggle('is-hidden', !(adsAvailable && freeGoldReady));
    $('free-gold-label').textContent = t('title.freeGold', { gold: freeGold });
  }

  // -------------------------------------------------------------- HUD --

  /** Called every frame; only touches the DOM when a value changed. */
  hud(run) {
    const set = (id, value) => {
      if (this.last[id] === value) return;
      this.last[id] = value;
      $(id).textContent = value;
    };
    set('hud-level', String(run.level));
    set('hud-clock', clock(DAWN - run.time));
    set('hud-kills', number(run.kills));
    set('hud-gold', number(run.amber));
    const xp = (run.xp / run.xpNext).toFixed(3);
    if (this.last.xp !== xp) {
      this.last.xp = xp;
      $('xp-fill').style.transform = `scaleX(${xp})`;
    }
  }

  resetHud() {
    this.last = {};
  }

  // --------------------------------------------------------- level up --

  levelUp(choices, canReroll) {
    this.choices = choices;
    const host = $('cards');
    host.innerHTML = '';
    choices.forEach((choice, index) => {
      const prefix = choice.kind === 'weapon' ? 'w' : choice.kind === 'passive' ? 'p' : 'h';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `card card--${choice.kind}`;
      card.dataset.choice = choice.id;
      const fresh = choice.level === 1;
      const level = choice.kind === 'heal' ? ''
        : fresh ? `<span class="card__level card__level--new">${t('level.new')}</span>`
          : `<span class="card__level">${t('level.lv', { level: choice.level })} / ${MAX_LEVEL}</span>`;
      card.innerHTML = `
        <span class="card__icon">${icon(choice.id)}</span>
        <span class="card__body">
          <span class="card__name">${t(`${prefix}.${choice.id}`)}</span>
          ${level}
          <span class="card__text">${t(`${prefix}.${choice.id}.d`)}</span>
        </span>`;
      card.addEventListener('click', () => {
        audio.sfx.click();
        this.handlers.choose(index);
      });
      host.appendChild(card);
    });
    $('btn-reroll').classList.toggle('is-hidden', !canReroll);
    this.show('level');
  }

  // ------------------------------------------------------------- over --

  /**
   * @param {object} result
   * @param {{time:number, level:number, kills:number, won:boolean}} result.summary
   * @param {number} result.gold      everything this run has paid so far
   * @param {boolean} result.newBest
   * @param {boolean} result.canRevive
   * @param {number} result.doubleGold what the double would add; 0 hides it
   */
  over(result) {
    const { summary } = result;
    $('over-title').textContent = t(summary.won ? 'over.dawn' : 'over.dead');
    $('over-title').classList.toggle('is-dawn', summary.won);
    $('over-best').classList.toggle('is-hidden', !result.newBest);
    $('over-time').textContent = clock(summary.time);
    $('over-level').textContent = String(summary.level);
    $('over-kills').textContent = number(summary.kills);
    $('over-gold').textContent = number(result.gold);
    $('btn-revive').classList.toggle('is-hidden', !result.canRevive);
    $('btn-double').classList.toggle('is-hidden', !(result.doubleGold > 0));
    $('double-label').textContent = t('over.double', { gold: number(result.doubleGold) });
    this.show('over');
  }

  // ------------------------------------------------------------- shop --

  showShop() {
    this.renderShop();
    this.show('shop');
  }

  renderShop() {
    const profile = save.get();
    $('shop-gold').textContent = number(profile.gold);
    const host = $('shop-list');
    host.innerHTML = '';
    for (const id of Object.keys(META)) {
      const level = save.metaLevel(id);
      const cost = save.metaCost(id);
      const pips = META[id].cost.map((_, i) => `<i class="${i < level ? 'is-on' : ''}"></i>`).join('');
      const item = document.createElement('div');
      item.className = 'item';
      item.dataset.meta = id;
      item.innerHTML = `
        <span class="item__icon">${icon(id)}</span>
        <div>
          <div class="item__name">${t('m.' + id)}</div>
          <div class="item__text">${t('m.' + id + '.d')}</div>
          <div class="pips">${pips}</div>
        </div>`;
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'btn' + (cost !== null && profile.gold >= cost ? ' btn--primary' : '');
      buy.disabled = cost === null || profile.gold < cost;
      buy.innerHTML = cost === null ? t('shop.max')
        : `<i class="coin" aria-hidden="true"></i>${number(cost)}`;
      buy.addEventListener('click', () => {
        audio.unlock();
        this.handlers.buy(id);
      });
      item.appendChild(buy);
      host.appendChild(item);
    }
  }

  // ------------------------------------------------------------ misc --

  setCurtain(visible, fake = false) {
    const curtain = $('curtain');
    curtain.classList.toggle('is-visible', visible);
    curtain.classList.toggle('is-fake', fake);
    $('curtain-text').textContent = t(fake ? 'ad.fake' : 'ad.playing');
  }

  toast(text, seconds = 2) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(this.toastHandle);
    this.toastHandle = setTimeout(() => el.classList.remove('is-visible'), seconds * 1000);
  }
}
