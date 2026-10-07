/**
 * Sıçra — entry point. Owns the state machine (menu → ready → running →
 * paused / dying → over), the fixed-step simulation and the render loop,
 * and wires input, audio, haptics, HUD, UI and the save file together.
 *
 * `window.__sicra` exposes a small deterministic API for the test suite:
 * start a seeded run, step it by hand, inject actions, inspect state.
 */

import * as THREE from 'three';
import { SPEED, SCORE, LANES, CHARACTERS, UPGRADE_PRICES, POWERUPS, COLORS } from './config.js';
import { Rng } from './rng.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';
import * as store from './save.js';
import * as input from './input.js';
import * as audio from './audio.js';
import * as haptics from './haptics.js';
import { Quality } from './quality.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Track } from './track.js';
import { Chaser } from './chaser.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { UI } from './ui.js';
import * as missions from './missions.js';

const FIXED = 1 / 120;
const MAX_FRAME = 1 / 20;

/* ------------------------------------------------------------ profile */

const profile = store.load();
i18n.setLanguage(profile.settings.language || i18n.detect());
i18n.apply();
haptics.setEnabled(profile.settings.vibrate);
audio.setSound(profile.settings.sound);
audio.setMusic(profile.settings.music);
missions.ensure(profile);
store.save();

/* ------------------------------------------------------------- scene */

const canvas = document.getElementById('view');
const world = new World(canvas);
const player = new Player(world.scene);
const chaser = new Chaser(world.scene);
const effects = new Effects(world.scene);
const hud = new Hud();
let rng = new Rng();
const track = new Track(world.scene, world, rng);

const quality = new Quality(profile.settings.quality, (level, auto) => {
  world.applyQuality(level);
  track.setDecorScale(level.decor);
  if (auto) {
    profile.settings.quality = level.id;
    store.save();
    hud.say(t('settings.qualityDropped', { level: t('settings.quality.' + level.id) }), 2.5);
  }
});
world.applyQuality(quality.level);
track.setDecorScale(quality.level.decor);

/* --------------------------------------------------------------- run */

const run = {
  distance: 0, coins: 0, score: 0, multiplier: 1, speed: SPEED.start,
  jumps: 0, slides: 0, gaps: 0, nearMisses: 0, magnets: 0, shields: 0, wings: 0,
  revived: 0, newBest: false, prevBest: null, coinPitch: 0, deathTimer: 0, how: null,
  hints: 0, stepTimer: 0, missionTimer: 0.5, lastTotal: { coins: 0, distance: 0, magnets: 0, shields: 0, wings: 0 },
};

let state = 'menu';
let auto = true;
let accumulator = 0;
let lastTime = performance.now();

function resetRun(seed) {
  rng = new Rng(seed);
  Object.assign(run, {
    distance: 0, coins: 0, score: 0, speed: SPEED.start,
    jumps: 0, slides: 0, gaps: 0, nearMisses: 0, magnets: 0, shields: 0, wings: 0,
    revived: 0, newBest: false, prevBest: null, coinPitch: 0, deathTimer: 0, how: null, hints: 0, stepTimer: 0, missionTimer: 0.5,
    lastTotal: { coins: 0, distance: 0, magnets: 0, shields: 0, wings: 0 },
  });
  run.multiplier = missions.multiplierFor(profile.missions.completedSets || 0);
  // "in one run" missions start from zero with the run
  for (const m of profile.missions.active) if (!m.done && m.scope === 'run') m.progress = 0;
  player.reset();
  player.setCharacter(profile.character);
  chaser.reset();
  track.reset(rng);
  input.clear();
  world.cameraPos.set(0, 4.4, -8.2);
  world.shake = 0;
  hud.lastScore = -1;
  hud.lastCoins = -1;
  hud.lastMult = -1;
}

function currentSpeed() {
  const ramp = Math.min(1, run.distance / SPEED.rampDistance);
  const base = SPEED.start + (SPEED.max - SPEED.start) * ramp;
  return player.flying ? base * SPEED.wings : base;
}

function scoreNow() {
  return (run.distance * SCORE.perMetre + run.coins * SCORE.perCoin) * run.multiplier;
}

/* ---------------------------------------------------------- states */

function toMenu() {
  state = 'menu';
  resetRun();
  chaser.group.visible = false;
  hud.show(false);
  ui.show('menu');
  audio.stopMusic();
}

function toReady(seed) {
  resetRun(seed);
  state = 'ready';
  chaser.group.visible = true;
  hud.show(true);
  ui.show(null);
  hud.setHint(t('hud.tapToStart'));
  player.state = 'idle';
}

function startRunning() {
  state = 'running';
  hud.setHint('');
  audio.startMusic();
  if (!profile.seenTutorial) {
    hud.say(t('hud.swipeLeftRight'), 2.5);
    run.hints = 1;
  }
}

function pauseRun() {
  if (state !== 'running') return;
  state = 'paused';
  ui.show('pause');
  audio.stopMusic();
}

function resumeRun() {
  if (state !== 'paused') return;
  state = 'running';
  ui.show(null);
  input.clear();
  audio.startMusic();
  lastTime = performance.now();
}

function die(how) {
  if (state !== 'running') return;
  state = 'dying';
  run.how = how;
  run.deathTimer = how === 'fell' ? 1.1 : 0.9;
  player.kill(how);
  audio.stopMusic();
  if (how === 'caught') {
    audio.sfx.crash();
    haptics.crash();
    world.kick(1);
    effects.crash(player.x, 1, player.z);
  } else {
    audio.sfx.fall();
    haptics.crash();
  }
}

function finishRun() {
  state = 'over';
  run.score = Math.floor(scoreNow());
  run.distance = Math.floor(run.distance);
  if (run.prevBest === null) run.prevBest = profile.best;
  run.newBest = run.score > run.prevBest;
  if (run.score > profile.best) profile.best = run.score;
  profile.bestDistance = Math.max(profile.bestDistance, run.distance);
  profile.coins += run.coins;
  profile.runs += 1;
  profile.totalDistance += run.distance;
  profile.totalCoins += run.coins;
  profile.seenTutorial = true;
  // missions: final tally and payout
  applyMissions(true);
  const settled = missions.settle(profile);
  if (settled.coins) profile.coins += settled.coins;
  store.save();
  const canRevive = run.revived === 0;
  ui.renderOver(run, run.how, canRevive, SCORE.reviveCost);
  ui.show('over');
}

function revive() {
  if (state !== 'over' || run.revived > 0 || profile.coins < SCORE.reviveCost) return;
  profile.coins -= SCORE.reviveCost;
  // the run's coins were already banked at finishRun; take them back out of
  // the bank so they are not counted twice when the run ends again
  profile.coins -= run.coins;
  profile.runs -= 1;
  profile.totalDistance -= run.distance;
  profile.totalCoins -= run.coins;
  store.save();
  run.revived += 1;
  player.revive();
  if (run.how === 'fell') {
    // put the runner back on the roof just ahead of the gap
    let z = player.z;
    while (!track.roofAt(z) && z < player.z + 12) z += 0.5;
    player.z = z + 0.5;
  }
  track.clearAhead(player.z, SCORE.reviveClear);
  chaser.reset();
  chaser.group.position.z = player.z - 6;
  state = 'running';
  ui.show(null);
  input.clear();
  audio.sfx.revive();
  effects.power(player.x, 1, player.z, COLORS.shield);
  audio.startMusic();
  lastTime = performance.now();
}

/* ---------------------------------------------------------- missions */

function applyMissions(final = false) {
  const stats = {
    coins: run.coins, distance: run.distance, jumps: player.stats.jumps, slides: player.stats.slides,
    gaps: player.stats.gaps, nearMisses: run.nearMisses, score: Math.floor(scoreNow()),
  };
  const delta = {
    coins: run.coins - run.lastTotal.coins,
    distance: run.distance - run.lastTotal.distance,
    magnets: run.magnets - run.lastTotal.magnets,
    shields: run.shields - run.lastTotal.shields,
    wings: run.wings - run.lastTotal.wings,
  };
  run.lastTotal = { coins: run.coins, distance: run.distance, magnets: run.magnets, shields: run.shields, wings: run.wings };
  const done = missions.update(profile, stats, delta);
  for (const m of done) {
    if (!final) {
      hud.say(t('hud.missionDone', { title: t('mission.' + m.type, { n: m.target }) }), 2.6, 'good');
      audio.sfx.mission();
      haptics.powerup();
    }
  }
  if (done.length) store.save();
}

/* ------------------------------------------------------------ update */

function handleAction(action) {
  if (state === 'ready') {
    if (action) { audio.unlock(); startRunning(); }
    return;
  }
  if (state !== 'running' || !action || action === 'tap') return;
  const did = player.act(action, audio.sfx);
  if (did === 'jump') { haptics.jump(); run.jumps += 1; }
  if (did === 'slide') haptics.slide();
  if (did && run.hints === 1 && (did === 'left' || did === 'right')) {
    run.hints = 2;
    hud.say(t('hud.swipeUp'), 2.5);
  } else if (did === 'jump' && run.hints === 2) {
    run.hints = 3;
    hud.say(t('hud.swipeDown'), 2.5);
  } else if (did === 'slide' && run.hints === 3) {
    run.hints = 4;
  }
}

function step(dt) {
  if (state === 'running') {
    run.speed = currentSpeed();
    const before = player.z;
    const event = player.update(dt, run.speed, (z) => track.roofAt(z), audio.sfx);
    run.distance += player.z - before;
    if (event === 'fell') { die('fell'); return; }
    if (event === 'land') { effects.dust(player.x, 0, player.z); }
    if (event === 'gap') { run.gaps += 1; }
    if (event && event.startsWith('powerdown:')) audio.sfx.powerdown();

    // footsteps
    if (player.state === 'run') {
      run.stepTimer -= dt;
      if (run.stepTimer <= 0) {
        audio.sfx.step(Math.min(1, run.speed / SPEED.max));
        run.stepTimer = Math.max(0.18, 0.62 - run.speed * 0.016);
      }
    }

    const result = track.update(dt, player, run.speed, effects);
    if (result.coins) {
      run.coins += result.coins;
      run.coinPitch = (run.coinPitch + result.coins) % 12;
      audio.sfx.coin(run.coinPitch);
      haptics.coin();
    }
    if (result.smashed.length) {
      audio.sfx.shieldHit();
      haptics.near();
      world.kick(0.4);
    }
    if (result.power) {
      const kind = result.power.kind;
      player.grant(kind, profile.upgrades[kind] || 1);
      run[kind + 's'] += 1;
      audio.sfx.powerup();
      haptics.powerup();
      effects.power(result.power.x, result.power.y, result.power.z, COLORS[kind]);
      hud.say(t('power.' + kind), 1.4);
    }
    if (result.near) {
      run.nearMisses += 1;
      audio.sfx.near();
      haptics.near();
    }
    if (result.hit) {
      die('caught');
      return;
    }
    run.score = scoreNow();
    chaser.update(dt, player, run.speed, null);
    const windy = player.flying ? 1 : Math.max(0, (run.speed - 13) / (SPEED.max - 13));
    effects.wind(dt, player, run.speed, windy);
    run.missionTimer -= dt;
    if (run.missionTimer <= 0) { run.missionTimer = 0.5; applyMissions(); }
    audio.setMusicTempo(112 + (run.speed - SPEED.start) * 2.4);
  } else if (state === 'dying') {
    player.update(dt, 0, (z) => track.roofAt(z), null);
    chaser.update(dt, player, run.speed, run.how);
    run.deathTimer -= dt;
    if (run.deathTimer <= 0) finishRun();
  } else if (state === 'ready' || state === 'menu') {
    chaser.update(dt, player, 0, null);
  }
  effects.update(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(MAX_FRAME, (now - lastTime) / 1000);
  lastTime = now;
  if (dt < 0) dt = 0;

  if (auto) {
    let action;
    while ((action = input.poll())) handleAction(action);
    if (state === 'running' || state === 'dying' || state === 'ready' || state === 'menu') {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= FIXED && guard < 12) {
        step(FIXED);
        accumulator -= FIXED;
        guard += 1;
      }
      if (accumulator > FIXED) accumulator = 0;
    }
    if (state === 'running') quality.sample(dt);
  }

  const lookBack = state === 'dying' && run.how === 'caught' ? Math.min(1, (0.9 - run.deathTimer) * 1.5) : 0;
  world.update(player.position, run.distance, dt, { lookBack, phaseOffset: 0 });
  chaser.setNight(world.day.stars);
  hud.update(dt, run, player, profile.upgrades);
  world.render();
}

/* ------------------------------------------------------------- UI */

const ui = new UI(profile, {
  click: () => { audio.unlock(); audio.sfx.click(); },
  play: () => { audio.unlock(); toReady(); },
  pause: () => pauseRun(),
  resume: () => resumeRun(),
  quit: () => toMenu(),
  retry: () => { toReady(); },
  menu: () => toMenu(),
  revive: () => revive(),
  select: (id) => { profile.character = id; player.setCharacter(id); store.save(); },
  buy: (id) => {
    const c = CHARACTERS.find((x) => x.id === id);
    if (!c || profile.owned.includes(id) || profile.coins < c.price) return;
    profile.coins -= c.price;
    profile.owned.push(id);
    profile.character = id;
    player.setCharacter(id);
    audio.sfx.buy();
    store.save();
  },
  upgrade: (kind) => {
    const level = profile.upgrades[kind] || 1;
    if (level >= POWERUPS.maxLevel) return;
    const price = UPGRADE_PRICES[level];
    if (profile.coins < price) return;
    profile.coins -= price;
    profile.upgrades[kind] = level + 1;
    audio.sfx.buy();
    store.save();
  },
  setting: (key, value) => {
    profile.settings[key] = value;
    if (key === 'language') { i18n.setLanguage(value); ui.retranslate(); }
    if (key === 'sound') audio.setSound(value);
    if (key === 'music') audio.setMusic(value);
    if (key === 'vibrate') haptics.setEnabled(value);
    if (key === 'quality') quality.set(value);
    store.save();
  },
  reset: () => {
    store.reset();
    Object.assign(profile, store.get());
    missions.ensure(profile);
    i18n.setLanguage(i18n.detect());
    ui.retranslate();
    player.setCharacter(profile.character);
    toMenu();
  },
});

/* ---------------------------------------------------------- wiring */

input.init(document.getElementById('surface'));
window.addEventListener('resize', () => world.resize());
window.addEventListener('orientationchange', () => setTimeout(() => world.resize(), 200));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
window.addEventListener('keydown', (e) => { if (e.code === 'Escape') { if (state === 'running') pauseRun(); else if (state === 'paused') resumeRun(); } });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

toMenu();
requestAnimationFrame(frame);

/* ------------------------------------------------------------ tests */

window.__sicra = {
  version: 1,
  get state() { return state; },
  run, player, track, chaser, world, profile,
  start(seed = 1) { toReady(seed); startRunning(); },
  ready(seed = 1) { toReady(seed); },
  setAuto(value) { auto = !!value; },
  step(dt = FIXED, n = 1) { for (let i = 0; i < n; i += 1) step(dt); },
  act(action) { handleAction(action); },
  pause: pauseRun, resume: resumeRun, revive, menu: toMenu, finish: finishRun,
  ui, hud,
  lanes: LANES,
  save: () => store.save(),
  THREE,
};
