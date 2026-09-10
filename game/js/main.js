/**
 * Entry point: loads the assets, owns the renderer and camera, and switches
 * between the two game modes.
 *
 * Each mode ("city" free roam, "highway" score attack) owns a THREE.Scene and
 * everything in it, so switching is just a matter of which scene gets drawn.
 * Modes are built the first time they are played, which keeps the initial
 * load to one city.
 */

import * as THREE from 'three';

import * as assets from './assets.js';
import * as audio from './audio.js';
import * as input from './input.js';
import * as save from './save.js';
import * as environment from './environment.js';
import * as garage from './garage.js';
import * as progress from './progress.js';
import * as haptics from './haptics.js';
import * as i18n from './i18n.js';
import { CitySession } from './city.js';
import { HighwaySession } from './highway.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { Quality } from './quality.js';
import { CAMERA, CARS, CITY } from './config.js';

const MODELS = [
  // city
  'city_ground', 'desert_floor', 'city_wall', 'beacon', 'traffic_light', 'pedestrian',
  'block_downtown', 'block_lowrise', 'block_park', 'block_industrial',
  'block_parking', 'block_tower', 'block_stadium', 'block_plaza',
  // vehicles
  'car_hatch', 'car_sport', 'car_muscle', 'car_van', 'car_super',
  'traffic_sedan', 'traffic_hatch', 'traffic_suv',
  'traffic_truck', 'traffic_bus', 'traffic_police',
  // highway
  'road', 'ground', 'guardrail', 'barrier',
  'palm', 'cactus', 'rock', 'mesa', 'lamp', 'billboard', 'cone',
  'coin', 'nitro',
];

const MAX_FRAME = 1 / 20;    // clamp dt so a stall cannot teleport the car

class Game {
  constructor() {
    this.state = 'loading';
    this.clock = new THREE.Clock();
    this.time = 0;
    this.mode = 'city';
    this.sessions = {};
    this.projected = new THREE.Vector3();
    this.quality = null;
    this.bankTimer = 0;
  }

  async boot() {
    save.load();
    // Language before anything renders, so no screen ever shows the wrong one.
    i18n.setLanguage(save.get().settings.language || i18n.detect());
    i18n.apply();
    this.hud = new Hud({
      onPlay: (mode) => this.startRun(mode),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onQuit: () => this.toMenu(),
      onSelectCar: () => this.equip(),
      onAutoThrottle: (value) => input.setAutoThrottle(value),
      onTilt: (value) => this.setTilt(value),
      onShadows: (value) => this.setShadows(value),
      onMusic: (value) => audio.setMusicEnabled(value),
      onVibrate: (value) => haptics.setEnabled(value),
      onLanguage: () => this.hud.refreshControls(),
      onLeftHanded: (value) => this.setLeftHanded(value),
    });
    this.hud.show('loading');

    this.setupRenderer();
    await assets.loadManifest();
    await assets.loadAll(MODELS, (done, total, name) => {
      this.hud.setProgress(done, total, name);
    });

    this.timeOfDay = environment.resolveTime(save.get().settings.timeOfDay);
    this.session = this.ensureSession('city');
    const minimapCanvas = document.getElementById('minimap');
    this.minimap = new Minimap(minimapCanvas, assets.manifest.city,
                               CITY.minimapSpan);
    this.minimap.setBlockKinds(
      this.session.blocks.map((block) => block.kind));
    minimapCanvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      audio.uiTap();
      minimapCanvas.classList.toggle('is-full', this.minimap.toggle() === 'full');
    });

    input.init({
      surface: document.getElementById('surface'),
      left: document.getElementById('btn-left'),
      right: document.getElementById('btn-right'),
      brake: document.getElementById('btn-brake'),
      gas: document.getElementById('btn-gas'),
      nitro: document.getElementById('btn-nitro'),
    }, { autoThrottle: save.get().settings.autoThrottle });

    // Quality before the first frame, so a slow phone never sees a bad one.
    this.quality = new Quality(save.get().settings.quality || 'high',
                               (level, auto) => this.applyQuality(level, auto));
    this.applyQuality(this.quality.level, false);

    audio.setEnabled(save.get().settings.sound);
    audio.setMusicEnabled(save.get().settings.music !== false);
    haptics.setEnabled(save.get().settings.vibrate !== false);
    this.setShadows(save.get().settings.shadows !== false);
    this.setLeftHanded(!!save.get().settings.leftHanded);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    const unlock = () => {
      audio.unlock();
      audio.setEnabled(save.get().settings.sound);
    };
    window.addEventListener('pointerdown', unlock, { once: true });

    this.toMenu();
    this.clock.start();
    requestAnimationFrame((t) => this.frame(t));
  }

  setupRenderer() {
    const canvas = document.getElementById('view');
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.setShadows(save.get().settings.shadows !== false);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fovPortrait, 1, 0.5, 1800);
    this.camera.position.set(0, CAMERA.height, CAMERA.distance);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const portrait = height > width;
    this.baseFov = portrait ? CAMERA.fovPortrait : CAMERA.fovLandscape;
    this.rigScale = portrait ? 1 : CAMERA.landscapeRigScale;
    this.camera.updateProjectionMatrix();
    for (const session of Object.values(this.sessions)) {
      session.rigScale = this.rigScale;
    }
    if (this.minimap) this.minimap.resize();
  }

  ensureSession(mode) {
    if (!this.sessions[mode]) {
      const Session = mode === 'city' ? CitySession : HighwaySession;
      const session = new Session(this.renderer, this.hud);
      session.rigScale = this.rigScale || 1;
      session.build(this.timeOfDay);
      if (this.quality && session.applyQuality) {
        session.applyQuality(this.quality.level);
      }
      session.poseCar(this.currentCar());
      this.sessions[mode] = session;
    }
    return this.sessions[mode];
  }

  /** The selected car as it currently drives: base stats plus fitted parts. */
  currentCar() {
    const id = save.get().selectedCar;
    return garage.tunedSpec(CARS.find((car) => car.id === id) || CARS[0]);
  }

  /** Re-fit whatever is selected. Called when the garage changes anything. */
  equip() {
    const car = this.currentCar();
    Object.values(this.sessions).forEach((session) => session.poseCar(car));
  }

  /** Silence everything the run was playing. */
  hushAudio() {
    audio.stopEngine();
    audio.stopAmbience();
    audio.stopMusic();
    audio.stopSiren();
  }

  toMenu() {
    if (this.mode === 'city' && this.session && this.session.stats) {
      this.bankCityEarnings();
    }
    this.state = 'menu';
    this.hushAudio();
    input.reset();
    this.session.poseCar(this.currentCar());
    this.hud.show('menu');
  }

  startRun(mode) {
    this.mode = mode || this.mode;
    this.session = this.ensureSession(this.mode);
    audio.unlock();
    audio.setEnabled(save.get().settings.sound);

    // A fresh look each run unless the player pinned one.
    this.timeOfDay = environment.resolveTime(save.get().settings.timeOfDay);
    if (this.session.setTimeOfDay) this.session.setTimeOfDay(this.timeOfDay);
    this.session.start(this.currentCar());
    input.reset();
    input.recentreTilt();
    this.banked = 0;
    this.bankTimer = 0;
    if (this.quality) this.quality.reset();

    this.state = 'playing';
    this.hud.setMode(this.mode);
    this.hud.showPlaying();
    if (save.firstTime('tutorial.' + this.mode)) {
      this.hud.showTutorial(this.mode === 'city' ? 'tutorial.city' : 'tutorial.rush');
    }
    audio.startEngine();
    audio.startMusic();
    if (this.mode === 'city') audio.startAmbience();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hushAudio();
    input.reset();
    if (this.mode === 'city') this.bankCityEarnings();
    this.hud.show('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.showPlaying();
    audio.startEngine();
    if (this.mode === 'city') audio.startAmbience();
  }

  /**
   * Put a quality level into effect.
   *
   * `auto` marks a step down the watchdog decided on; the player is told once,
   * because a game quietly getting uglier is worse than one that says why.
   */
  applyQuality(level, auto) {
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, level.pixelRatio));
    const wantShadows = level.shadows && save.get().settings.shadows !== false;
    this.setShadows(wantShadows);
    for (const session of Object.values(this.sessions)) {
      if (session.applyQuality) session.applyQuality(level);
    }
    if (auto) {
      save.setSetting('quality', level.id);
      this.hud.toast(i18n.t('toast.qualityDropped'), 2.6);
    }
  }

  /**
   * Real shadows or blob shadows -- never both.
   *
   * Switching at runtime changes how materials are compiled, so every one has
   * to be told to rebuild; the alternative is asking the player to restart.
   */
  setShadows(enabled) {
    this.renderer.shadowMap.enabled = enabled;
    environment.setBlobShadows(!enabled);
    for (const session of Object.values(this.sessions)) {
      session.scene.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) {
          if (material) material.needsUpdate = true;
        }
      });
    }
  }

  setLeftHanded(enabled) {
    document.body.classList.toggle('is-left-handed', enabled);
  }

  async setTilt(enabled) {
    if (!enabled) {
      input.disableTilt();
      this.hud.setTiltState(false);
      return;
    }
    const granted = await input.enableTilt();
    this.hud.setTiltState(granted);
    if (!granted) this.hud.toast(i18n.t('settings.noTilt'));
  }

  /** Free roam has no run end, so pay out as we go. */
  bankCityEarnings() {
    const session = this.sessions.city;
    if (!session || !session.stats) return;
    // Damage is banked whether or not there is money to bank: it is what the
    // garage charges to put right, so it has to outlive the session. Only
    // when it has actually moved, though -- this runs on a timer, and a
    // profile written to disk every few seconds for no reason is a profile
    // that will eventually overwrite something that mattered.
    const carId = session.car && session.car.spec ? session.car.spec.id : null;
    if (carId && Math.abs(save.damageFor(carId) - session.car.damage) > 0.001) {
      save.setDamage(carId, session.car.damage);
    }
    const owed = session.stats.coins - (this.banked || 0);
    if (owed <= 0) return;
    save.addCoins(owed);
    this.banked = session.stats.coins;
    this.hud.refreshMenu();
  }

  endHighwayRun() {
    this.state = 'over';
    this.hushAudio();
    haptics.crash();
    const run = this.session.run;
    const previousBest = save.get().best;
    save.addCoins(run.coins);
    save.recordRun(run.score, run.distance);
    this.hud.showGameOver({
      score: run.score,
      distance: run.distance,
      coins: run.coins,
      isBest: run.score > previousBest,
    });
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(this.clock.getDelta(), MAX_FRAME);
    this.time += dt;
    if (this.state === 'playing' && this.quality) this.quality.sample(dt);

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'over') this.updateAfterCrash(dt);
    else this.session.poseForMenu(dt, this.camera, this.baseFov);

    this.renderer.render(this.session.scene, this.camera);
  }

  update(dt) {
    const controls = input.sample();
    // `testInput` is a hook for automated runs: they drive by overriding the
    // sampled controls, so the real input path stays exactly as a player uses it.
    if (this.testInput) Object.assign(controls, this.testInput);
    if (input.consumeNitro()) {
      if (this.mode === 'city') this.session.car.requestBoost();
      else this.session.requestBoost();
    }

    const state = this.session.update(dt, controls, this.time);
    this.session.updateCamera(dt, this.camera);
    this.applyFov(dt);
    this.hud.updateHud(state);

    if (this.mode === 'city') {
      this.minimap.draw(this.session.car, this.session.coins,
                        this.session.mission, this.session.traffic.cars,
                        this.session.police.position);
      this.hud.setTargetArrow(this.targetMarker(this.session.mission));
      this.bankTimer += dt;
      if (this.bankTimer > 8) {
        this.bankTimer = 0;
        this.bankCityEarnings();
      }
    } else if (this.session.over) {
      this.endHighwayRun();
    }

    audio.updateEngine(controls.throttle,
                       this.mode === 'city'
                         ? this.session.car.speedRatio
                         : this.session.player.speedRatio,
                       state.boosting);
    // Handed back so an automated run can see what the HUD was told, including
    // the one-shot events (a fine, a promotion) that are cleared on read.
    return state;
  }

  /**
   * Where to draw the delivery pointer.
   *
   * The beacon is projected into screen space; while it is on screen the
   * player can just look at it, so the arrow only appears once the target
   * leaves the view -- clamped to the screen edge and rotated to point at it.
   * Points behind the camera project mirrored, hence the flip.
   */
  targetMarker(mission) {
    if (!mission) return { visible: false };
    const point = this.projected.set(mission.x, 2.5, mission.z).project(this.camera);
    const behind = point.z > 1;
    let x = behind ? -point.x : point.x;
    let y = behind ? -point.y : point.y;

    const edge = 0.86;
    if (!behind && Math.abs(x) < edge && Math.abs(y) < edge) {
      return { visible: false };
    }

    const scale = Math.max(Math.abs(x), Math.abs(y)) || 1;
    x /= scale;
    y /= scale;

    const margin = 34;
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      visible: true,
      x: Math.min(width - margin, Math.max(margin, (x * 0.5 + 0.5) * width)),
      y: Math.min(height - margin, Math.max(margin, (-y * 0.5 + 0.5) * height)),
      // The arrow art points up; CSS rotation is clockwise.
      angle: Math.atan2(x, y) * 180 / Math.PI,
    };
  }

  updateAfterCrash(dt) {
    const state = this.session.update(dt, { steer: 0, throttle: 0, brake: true },
                                      this.time);
    this.session.updateCamera(dt, this.camera);
    this.hud.updateHud(state);
  }

  applyFov(dt) {
    const ratio = this.mode === 'city'
      ? this.session.car.speedRatio : this.session.player.speedRatio;
    const boosting = this.mode === 'city'
      ? this.session.car.boosting : this.session.player.boosting;
    const fov = this.baseFov + CAMERA.speedFovBoost * ratio + (boosting ? 5 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }
}

const game = new Game();
game.boot().catch((error) => {
  console.error(error);
  const label = document.getElementById('loading-label');
  if (label) label.textContent = i18n.t('loading.error', { message: error.message });
});

window.game = game;      // handy for debugging from the console
// The headless suites drive this same page, so they read the manifest and the
// tuning tables through the game rather than keeping their own copies.
game.assets = assets;
game.config = { CAMERA, CARS, CITY };
game.save = save;
game.progress = progress;
