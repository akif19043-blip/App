/**
 * Glowfly: the conductor. Owns the state machine, the loop and the portal
 * calls; the night itself is run.js, the drawing render.js, the screens ui.js.
 *
 * States: title, shop, settings (menus over an idle meadow) -> playing <->
 * level (choosing an upgrade), paused -> over (dead or dawn) -> title or a
 * new run.
 */

import * as audio from './audio.js';
import * as input from './input.js';
import * as portal from './portal.js';
import * as save from './save.js';
import { Run } from './run.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { t, apply, detect, setLanguage } from './i18n.js';
import { ADS, DAWN, META, RUN_GOLD, VIEW } from './config.js';
import * as config from './config.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;           // a long stall slows the night, never skips it

class Game {
  constructor() {
    this.state = 'boot';
    this.run = null;
    this.accumulator = 0;
    this.runsThisSession = 0;
    this.last = 0;
    this.slowFrames = 0;
    this.params = new URLSearchParams(location.search);
  }

  async boot() {
    await portal.init();
    portal.loadingStart();
    save.load();
    setLanguage(save.get().settings.language || detect());
    apply();

    this.renderer = new Renderer(document.getElementById('view'));
    this.ui = new UI({
      play: () => this.startRun(),
      back: () => this.toTitle(),
      freeGold: () => this.adFreeGold(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      quit: () => this.quitRun(),
      choose: (index) => this.choose(index),
      reroll: () => this.adReroll(),
      revive: () => this.adRevive(),
      double: () => this.adDouble(),
      menu: () => this.toTitle(),
      buy: (id) => this.buy(id),
      settings: () => this.applySettings(),
    });
    input.init(document.getElementById('surface'), { onPause: () => this.togglePause() });

    this.applySettings();
    audio.setPortalMuted(portal.portalMuted());
    portal.onMuteChange((muted) => audio.setPortalMuted(muted));
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      audio.setPaused(document.hidden);
      if (document.hidden) this.pause();
    });
    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    window.addEventListener('keydown', () => audio.unlock(), { once: true });
    this.resize();

    portal.loadingStop();
    this.toTitle();
    requestAnimationFrame((now) => this.frame(now));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || VIEW.maxDpr);
    const view = this.renderer.resize(window.innerWidth, window.innerHeight, dpr);
    if (this.run) this.run.view = view;
  }

  applySettings() {
    const settings = save.get().settings;
    audio.setSound(settings.sound);
    audio.setMusic(settings.music);
    if (this.state === 'title') this.refreshTitle();
  }

  // ------------------------------------------------------------- loop --

  frame(now) {
    requestAnimationFrame((next) => this.frame(next));
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.watchFrameRate(dt);
    if (this.state === 'playing' && !portal.isAdActive()) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS && this.state === 'playing') {
        this.tick();
        this.accumulator -= STEP;
        steps += 1;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
    }
    this.draw(this.state === 'playing' ? dt : 0, dt);
  }

  /** One fixed step of the night, and whatever it set off. */
  tick(move = this.testMove || input.vector()) {
    const run = this.run;
    run.step(STEP, move);
    this.react(run.events);
    run.events.length = 0;
    if (run.over) this.enterOver();
    else if (run.pendingLevels > 0) this.enterLevel();
  }

  draw(dt, wall) {
    if (this.run && this.state !== 'title' && this.state !== 'shop' && this.state !== 'settings') {
      this.renderer.draw(this.run, dt, { numbers: save.get().settings.numbers });
      this.ui.hud(this.run);
    } else {
      this.renderer.drawAmbient(wall);
    }
  }

  /**
   * A phone that cannot keep up gets a lower pixel ratio, once. Smoothness
   * beats sharpness when there are three hundred bugs on screen.
   */
  watchFrameRate(dt) {
    if (this.state !== 'playing' || this.dprCap === 1 || !dt) return;
    this.slowFrames = dt > 1 / 40 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90 && (window.devicePixelRatio || 1) > 1) {
      this.dprCap = 1;
      this.resize();
    }
  }

  react(events) {
    const options = { numbers: save.get().settings.numbers };
    this.renderer.absorb(events, options);
    for (const e of events) {
      const sound = audio.sfx[e.t];
      if (sound) sound();
      if (e.t === 'elite') {
        audio.sfx.warn();
        this.ui.toast(t('toast.elite'), 2.4);
      } else if (e.t === 'boss') {
        audio.sfx.warn();
        this.ui.toast(t('toast.boss'), 3);
      } else if (e.t === 'ring') {
        this.ui.toast(t('toast.ring'), 2);
      }
    }
  }

  // ----------------------------------------------------------- states --

  toTitle() {
    this.state = 'title';
    portal.gameplayStop();
    input.setEnabled(false);
    this.run = null;
    this.ui.show('title');
    this.refreshTitle();
  }

  refreshTitle() {
    const wait = Date.now() - save.get().freeGoldAt;
    const ready = wait >= ADS.freeGoldCooldown * 1000 || wait < 0;
    this.ui.refreshTitle({ adsAvailable: portal.hasRewarded(), freeGoldReady: ready,
                           freeGold: ADS.freeGold });
    clearTimeout(this.freeGoldHandle);
    if (!ready) {
      this.freeGoldHandle = setTimeout(() => {
        if (this.state === 'title') this.refreshTitle();
      }, ADS.freeGoldCooldown * 1000 - wait + 50);
    }
  }

  async startRun() {
    if (this.starting || portal.isAdActive()) return;
    this.starting = true;
    try {
      audio.unlock();
      // A break between runs is where a portal may show an ad -- never
      // before the first one: nobody should see an ad before they have played.
      if (this.runsThisSession > 0) await portal.midgame(this.adHooks());
      const seed = Number(this.params.get('seed')) || ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
      this.run = new Run({ seed: seed + this.runsThisSession, meta: save.metaLevels() });
      this.run.view = this.renderer.view;
      this.runsThisSession += 1;
      this.banked = 0;
      this.killsBanked = 0;
      this.bonus = 0;
      this.doubled = false;
      this.bestBefore = save.get().best;
      this.accumulator = 0;
      this.ui.resetHud();
      this.state = 'playing';
      input.setEnabled(true);
      this.ui.show(null);
      portal.gameplayStart();
      audio.startMusic();
    } finally {
      this.starting = false;
    }
  }

  enterLevel() {
    this.state = 'level';
    input.setEnabled(false);
    this.rerolled = false;
    this.choices = this.run.offerChoices();
    this.ui.levelUp(this.choices, portal.hasRewarded());
  }

  choose(index) {
    if (this.state !== 'level' || !this.choices[index]) return;
    this.run.choose(this.choices[index]);
    if (this.run.pendingLevels > 0) {
      this.enterLevel();
      return;
    }
    this.state = 'playing';
    this.ui.show(null);
    input.setEnabled(true);
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'level') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    input.setEnabled(false);
    portal.gameplayStop();
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    portal.gameplayStart();
    if (this.pausedFrom === 'level') {
      this.state = 'level';
      this.ui.levelUp(this.choices, portal.hasRewarded() && !this.rerolled);
      return;
    }
    this.state = 'playing';
    input.setEnabled(true);
    this.ui.show(null);
  }

  togglePause() {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }

  quitRun() {
    if (this.state !== 'paused' || !this.run) return;
    // Ending a run early still pays what it earned.
    this.run.over = true;
    this.enterOver();
  }

  /** What a run is worth so far: amber (with Greed), minutes, dawn. */
  runGold(summary) {
    const amber = Math.round(summary.amber * this.run.stats.gold);
    return amber + Math.floor(summary.time / 60) * RUN_GOLD.perMinute
      + (summary.won ? RUN_GOLD.dawn : 0);
  }

  enterOver() {
    this.state = 'over';
    input.setEnabled(false);
    portal.gameplayStop();
    const run = this.run;
    const summary = run.summary();
    if (summary.won) {
      run.vacuum();
      summary.amber = run.amber;
    }
    // Pay what this stretch earned. A revived run was paid to its first
    // death already, and must not pay those coins twice.
    const gold = this.runGold(summary);
    save.addGold(gold - this.banked);
    this.banked = gold;
    save.addKills(summary.kills - this.killsBanked);
    this.killsBanked = summary.kills;
    const newBest = summary.time > this.bestBefore;
    save.recordRun(summary, !run.revived);
    if (summary.won || newBest) portal.happytime();
    this.ui.over({
      summary,
      gold: gold + this.bonus,
      newBest,
      canRevive: portal.hasRewarded() && !summary.won && !run.revived,
      doubleGold: portal.hasRewarded() && !this.doubled ? gold : 0,
    });
  }

  buy(id) {
    if (save.buyMeta(id)) {
      audio.sfx.buy();
      this.ui.toast(t('toast.bought', { name: t('m.' + id) }), 1.6);
    } else {
      this.ui.toast(t('toast.poor'), 1.6);
    }
    this.ui.renderShop();
  }

  // ----------------------------------------------------- rewarded ads --

  adHooks() {
    return {
      start: () => audio.setAdMuted(true),
      end: () => audio.setAdMuted(false),
    };
  }

  /**
   * Play a rewarded ad. The game is covered while it is fetched and played,
   * so a second tap cannot land on anything behind it. Resolves true only if
   * it paid.
   */
  async watchAd() {
    if (portal.isAdActive()) return false;
    this.ui.setCurtain(true, portal.name() === 'fake');
    let result;
    try {
      result = await portal.rewarded(this.adHooks());
    } finally {
      this.ui.setCurtain(false);
      audio.setAdMuted(false);
    }
    if (!result.paid) this.ui.toast(t(result.shown ? 'ad.notPaid' : 'ad.none'), 2.4);
    return result.paid;
  }

  async adFreeGold() {
    if (this.state !== 'title') return;
    if (!await this.watchAd()) return;
    save.addGold(ADS.freeGold);
    save.markFreeGold();
    audio.sfx.amber();
    this.ui.toast(t('toast.gold', { gold: ADS.freeGold }));
    this.refreshTitle();
  }

  async adReroll() {
    if (this.state !== 'level' || this.rerolled) return;
    if (!await this.watchAd() || this.state !== 'level') return;
    this.rerolled = true;
    this.choices = this.run.offerChoices(this.choices);
    this.ui.levelUp(this.choices, false);
  }

  async adRevive() {
    if (this.state !== 'over' || !this.run || this.run.revived || this.run.won) return;
    if (!await this.watchAd() || this.state !== 'over') return;
    if (!this.run.revive()) return;
    this.react(this.run.events);
    this.run.events.length = 0;
    this.state = 'playing';
    this.accumulator = 0;
    input.setEnabled(true);
    this.ui.show(null);
    portal.gameplayStart();
  }

  async adDouble() {
    if (this.state !== 'over' || this.doubled) return;
    if (!await this.watchAd() || this.state !== 'over') return;
    this.doubled = true;
    this.bonus += this.banked;
    save.addGold(this.banked);
    audio.sfx.amber();
    this.ui.toast(t('toast.gold', { gold: this.banked }));
    const summary = this.run.summary();
    this.ui.over({
      summary,
      gold: this.banked + this.bonus,
      newBest: summary.time > this.bestBefore,
      canRevive: portal.hasRewarded() && !summary.won && !this.run.revived,
      doubleGold: 0,
    });
  }
}

const game = new Game();
window.glowfly = {
  game,
  portal,
  save,
  config,
  META,
  DAWN,
  /** Advance a run by `n` fixed steps, steering with `move`. For the tests. */
  step(n = 1, move = { x: 0, y: 0 }) {
    for (let i = 0; i < n && game.state === 'playing'; i += 1) game.tick(move);
    return game.state;
  },
};
game.boot().catch((error) => {
  console.error(error);
});
