/**
 * Screens and the in-run HUD.
 *
 * This module owns every DOM read and write in the game; the simulation
 * modules never touch the document. It exposes plain callbacks so main.js
 * decides what a button means.
 */

import * as save from './save.js';
import * as audio from './audio.js';
import * as garage from './garage.js';
import { t, apply as applyStrings, language, setLanguage, LANGUAGES }
  from './i18n.js';
import { CARS, PAINTS } from './config.js';

const SCREENS = ['loading', 'menu', 'garage', 'settings', 'paused', 'over'];

export class Hud {
  constructor(handlers) {
    this.handlers = handlers;
    this.el = {};
    SCREENS.forEach((name) => {
      this.el[name] = document.getElementById('screen-' + name);
    });
    this.el.hud = document.getElementById('hud');
    this.el.chipScore = document.getElementById('chip-score');
    this.el.chipTarget = document.getElementById('chip-target');
    this.el.target = document.getElementById('hud-target');
    this.el.timer = document.getElementById('hud-timer');
    this.el.minimap = document.getElementById('minimap');
    this.el.arrow = document.getElementById('target-arrow');
    this.el.tutorial = document.getElementById('tutorial');
    this.el.tutorialText = document.getElementById('tutorial-text');
    this.el.controls = document.getElementById('controls');
    this.el.speed = document.getElementById('hud-speed');
    this.el.score = document.getElementById('hud-score');
    this.el.coins = document.getElementById('hud-coins');
    this.el.distance = document.getElementById('hud-distance');
    this.el.nitroFill = document.getElementById('hud-nitro-fill');
    this.el.nitroButton = document.getElementById('btn-nitro');
    this.el.gas = document.getElementById('btn-gas');
    this.el.toast = document.getElementById('toast');
    this.el.progress = document.getElementById('loading-bar');
    this.el.progressLabel = document.getElementById('loading-label');
    this.el.garageList = document.getElementById('garage-list');
    this.el.garageTune = document.getElementById('garage-tune');
    this.el.menuBest = document.getElementById('menu-best');
    this.el.menuCoins = document.getElementById('menu-coins');
    this.el.garageCoins = document.getElementById('garage-coins');

    this.toastTimer = 0;
    this.bindButtons();
    this.buildLanguagePicker();
  }

  bindButtons() {
    const tap = (id, fn) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('click', (event) => {
        event.preventDefault();
        audio.uiTap();
        fn();
      });
    };

    tap('btn-play-city', () => this.handlers.onPlay('city'));
    tap('btn-play-highway', () => this.handlers.onPlay('highway'));
    tap('btn-garage', () => this.showGarage());
    tap('btn-settings', () => this.show('settings'));
    tap('btn-garage-back', () => this.show('menu'));
    tap('btn-settings-back', () => this.show('menu'));
    tap('btn-pause', () => this.handlers.onPause());
    tap('btn-resume', () => this.handlers.onResume());
    tap('btn-quit', () => this.handlers.onQuit());
    tap('btn-retry', () => this.handlers.onPlay(this.mode));
    tap('btn-tutorial', () => this.hideTutorial());
    tap('btn-over-menu', () => this.handlers.onQuit());

    this.bindToggle('toggle-sound', 'sound', (value) => {
      audio.setEnabled(value);
    });
    this.bindToggle('toggle-throttle', 'autoThrottle', (value) => {
      this.handlers.onAutoThrottle(value);
      this.refreshControls();
    });
    this.bindToggle('toggle-tilt', 'tilt', (value) => {
      this.handlers.onTilt(value);
    });
    this.bindToggle('toggle-music', 'music', (value) => {
      this.handlers.onMusic(value);
    });
    this.bindToggle('toggle-vibrate', 'vibrate', (value) => {
      this.handlers.onVibrate(value);
    });
    this.bindToggle('toggle-shadows', 'shadows', (value) => {
      this.handlers.onShadows(value);
    });
    this.bindToggle('toggle-lefthanded', 'leftHanded', (value) => {
      this.handlers.onLeftHanded(value);
    });
  }

  /**
   * Language picker. Changing it re-renders every screen, since the garage and
   * the HUD build their text at render time.
   */
  buildLanguagePicker() {
    const host = document.getElementById('lang-options');
    if (!host) return;
    host.innerHTML = '';
    for (const entry of LANGUAGES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lang__option'
        + (entry.code === language() ? ' is-on' : '');
      button.textContent = entry.label;
      button.addEventListener('click', () => {
        audio.uiTap();
        save.setSetting('language', setLanguage(entry.code));
        applyStrings();
        this.buildLanguagePicker();
        this.renderGarage();
        this.refreshMenu();
        this.handlers.onLanguage(language());
      });
      host.appendChild(button);
    }
  }

  bindToggle(id, key, apply) {
    const node = document.getElementById(id);
    if (!node) return;
    const settings = save.get().settings;
    node.checked = !!settings[key];
    node.addEventListener('change', () => {
      save.setSetting(key, node.checked);
      apply(node.checked);
    });
    this.el[id] = node;
  }

  /** Tilt can be refused by the OS; reflect the real state back to the box. */
  setTiltState(enabled) {
    if (this.el['toggle-tilt']) this.el['toggle-tilt'].checked = enabled;
    save.setSetting('tilt', enabled);
  }

  /**
   * Free roam and the traffic racer want different readouts: a distance to the
   * next delivery and a map, versus a score.
   */
  setMode(mode) {
    this.mode = mode;
    const city = mode === 'city';
    this.el.chipScore.classList.toggle('is-hidden', city);
    this.el.chipTarget.classList.toggle('is-hidden', !city);
    this.el.minimap.classList.toggle('is-hidden', !city);
    if (!city) this.setTargetArrow({ visible: false });
  }

  show(name) {
    if (name !== null) this.hideTutorial();
    SCREENS.forEach((key) => {
      if (this.el[key]) this.el[key].classList.toggle('is-visible', key === name);
    });
    const playing = name === null;
    this.el.hud.classList.toggle('is-visible', playing);
    this.el.controls.classList.toggle('is-visible', playing);
    if (name === 'menu') this.refreshMenu();
    this.current = name;
  }

  showPlaying() {
    this.show(null);
    this.refreshControls();
  }

  refreshControls() {
    const auto = save.get().settings.autoThrottle;
    if (this.el.gas) this.el.gas.classList.toggle('is-hidden', auto);
  }

  refreshMenu() {
    const profile = save.get();
    this.el.menuBest.textContent = formatNumber(profile.best);
    this.el.menuCoins.textContent = formatNumber(profile.coins);
  }

  setProgress(done, total, name) {
    const ratio = total ? done / total : 0;
    this.el.progress.style.width = Math.round(ratio * 100) + '%';
    this.el.progressLabel.textContent = name
      ? `${name} (${done}/${total})` : t('loading.preparing');
  }

  showGarage() {
    this.renderGarage();
    this.show('garage');
  }

  renderGarage() {
    const profile = save.get();
    this.el.garageCoins.textContent = formatNumber(profile.coins);
    this.el.garageList.innerHTML = '';

    CARS.forEach((car) => {
      const owned = save.owns(car.id);
      const selected = profile.selectedCar === car.id;
      const card = document.createElement('article');
      card.className = 'car-card'
        + (selected ? ' is-selected' : '')
        + (owned ? '' : ' is-locked');

      card.innerHTML = `
        <div class="car-card__swatch" style="--paint:${garage.paint(car)}"></div>
        <div class="car-card__body">
          <h3>${t(car.nameKey)}</h3>
          <p class="car-card__tag">${t(car.tagKey)}</p>
          <dl class="car-card__stats">
            ${statBar(t('garage.statSpeed'), car.topSpeed / 90)}
            ${statBar(t('garage.statAccel'), car.accel / 16)}
            ${statBar(t('garage.statGrip'), car.handling / 1.3)}
          </dl>
        </div>
        <button class="car-card__action" type="button"></button>
      `;

      const action = card.querySelector('.car-card__action');
      if (selected) {
        action.textContent = t('garage.selected');
        action.disabled = true;
      } else if (owned) {
        action.textContent = t('garage.select');
        action.addEventListener('click', () => {
          audio.uiTap();
          save.selectCar(car.id);
          this.handlers.onSelectCar(car);
          this.renderGarage();
        });
      } else {
        action.textContent = `${formatNumber(car.price)} 🪙`;
        action.disabled = profile.coins < car.price;
        action.addEventListener('click', () => {
          audio.uiTap();
          if (save.buy(car)) {
            save.selectCar(car.id);
            this.handlers.onSelectCar(car);
            this.toast(t('garage.bought', { car: t(car.nameKey) }));
          } else {
            this.toast(t('garage.tooPoor'));
          }
          this.renderGarage();
        });
      }
      this.el.garageList.appendChild(card);
    });

    this.renderTuning();
  }

  /**
   * Parts and paint for the car currently selected. Only shown for a car the
   * player owns -- there is nothing to fit to a locked one.
   */
  renderTuning() {
    const profile = save.get();
    const car = CARS.find((entry) => entry.id === profile.selectedCar);
    const panel = this.el.garageTune;
    if (!panel) return;
    if (!car || !save.owns(car.id)) {
      panel.innerHTML = '';
      return;
    }

    const rows = garage.upgradeState(car).map((part) => {
      const pips = Array.from({ length: part.levels }, (_, i) =>
        `<i class="${i < part.level ? 'is-on' : ''}"></i>`).join('');
      const affordable = part.cost !== null && profile.coins >= part.cost;
      const label = part.cost === null
        ? t('garage.full') : `${formatNumber(part.cost)} 🪙`;
      return `<button class="tune__row${affordable ? '' : ' is-disabled'}"
                      type="button" data-part="${part.id}"
                      ${part.cost === null || !affordable ? 'disabled' : ''}>
        <span class="tune__name">${t(part.nameKey)}</span>
        <span class="tune__pips">${pips}</span>
        <span class="tune__cost">${label}</span>
      </button>`;
    }).join('');

    const current = garage.paint(car);
    const paints = PAINTS.map((color) =>
      `<button class="tune__paint${color === current ? ' is-on' : ''}"
               type="button" data-paint="${color}"
               style="--paint:${color}"
               aria-label="${t('garage.paintOf', { color })}"></button>`
    ).join('');

    panel.innerHTML = `
      <h3 class="tune__title">${t('garage.parts', { car: t(car.nameKey) })}</h3>
      <div class="tune__rows">${rows}</div>
      <h3 class="tune__title">${t('garage.paint')}</h3>
      <div class="tune__paints">${paints}</div>
    `;

    panel.querySelectorAll('[data-part]').forEach((button) => {
      button.addEventListener('click', () => {
        audio.uiTap();
        if (garage.buyUpgrade(car, button.dataset.part)) {
          this.handlers.onSelectCar(car);
          this.toast(t('garage.upgraded', { car: t(car.nameKey) }));
        } else {
          this.toast(t('garage.tooPoor'));
        }
        this.renderGarage();
      });
    });
    panel.querySelectorAll('[data-paint]').forEach((button) => {
      button.addEventListener('click', () => {
        audio.uiTap();
        garage.setPaint(car, button.dataset.paint);
        this.handlers.onSelectCar(car);
        this.renderGarage();
      });
    });
  }

  /**
   * Place the off-screen delivery pointer.
   * @param {{visible:boolean,x:number,y:number,angle:number}} marker
   */
  setTargetArrow(marker) {
    const arrow = this.el.arrow;
    if (!arrow) return;
    arrow.classList.toggle('is-visible', marker.visible);
    if (!marker.visible) return;
    arrow.style.transform =
      `translate(${marker.x.toFixed(1)}px, ${marker.y.toFixed(1)}px)`
      + ` rotate(${marker.angle.toFixed(1)}deg)`;
  }

  /** First-run control hint. Non-blocking: the run is already going. */
  showTutorial(key) {
    if (!this.el.tutorial) return;
    this.el.tutorialText.textContent = t(key);
    this.el.tutorial.classList.add('is-visible');
    clearTimeout(this.tutorialHandle);
    this.tutorialHandle = setTimeout(() => this.hideTutorial(), 9000);
  }

  hideTutorial() {
    clearTimeout(this.tutorialHandle);
    if (this.el.tutorial) this.el.tutorial.classList.remove('is-visible');
  }

  updateHud(state) {
    this.el.speed.textContent = state.kmh;
    this.el.coins.textContent = formatNumber(state.coins);
    this.el.distance.textContent = formatNumber(Math.round(state.distance));
    if (state.score !== undefined) {
      this.el.score.textContent = formatNumber(state.score);
    }
    if (state.target !== undefined) {
      this.el.target.textContent = formatNumber(state.target);
    }
    if (this.el.timer && state.timeLeft !== undefined) {
      const left = state.timeLeft;
      this.el.timer.textContent = left === null ? '--' : formatClock(left);
      this.el.timer.classList.toggle('is-urgent', left !== null && left > 0
        && left < 10);
      this.el.timer.classList.toggle('is-expired', left === 0);
    }
    this.el.nitroFill.style.transform = `scaleX(${state.nitro.toFixed(3)})`;
    this.el.nitroButton.classList.toggle('is-ready', state.nitro > 0.1);
    this.el.nitroButton.classList.toggle('is-firing', state.boosting);
  }

  showGameOver(result) {
    document.getElementById('over-score').textContent =
      formatNumber(Math.round(result.score));
    document.getElementById('over-distance').textContent =
      formatNumber(Math.round(result.distance)) + ' m';
    document.getElementById('over-coins').textContent =
      formatNumber(result.coins);
    document.getElementById('over-best').textContent =
      formatNumber(save.get().best);
    const banner = document.getElementById('over-banner');
    banner.textContent = t(result.isBest ? 'over.record' : 'over.crashed');
    banner.classList.toggle('is-record', !!result.isBest);
    this.show('over');
  }

  toast(message, seconds = 1.8) {
    this.el.toast.textContent = message;
    this.el.toast.classList.add('is-visible');
    clearTimeout(this.toastHandle);
    this.toastHandle = setTimeout(() => {
      this.el.toast.classList.remove('is-visible');
    }, seconds * 1000);
  }
}

function statBar(label, ratio) {
  const width = Math.max(4, Math.min(100, Math.round(ratio * 100)));
  return `<div class="stat"><dt>${label}</dt>
    <dd><span style="width:${width}%"></span></dd></div>`;
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString('tr-TR');
}
