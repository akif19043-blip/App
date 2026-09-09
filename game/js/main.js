/**
 * Entry point: wires the modules together and runs the frame loop.
 *
 * Game states are deliberately explicit ('loading' | 'menu' | 'playing' |
 * 'paused' | 'over'); the loop keeps rendering in every one of them so the
 * menus sit over a live scene rather than a frozen frame.
 */

import * as THREE from 'three';

import * as assets from './assets.js';
import * as audio from './audio.js';
import * as input from './input.js';
import * as save from './save.js';
import { Hud } from './hud.js';
import { Pickups } from './pickups.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { World } from './world.js';
import { CAMERA, CARS, PLAY, SCORE, TRAFFIC, WORLD } from './config.js';

const MODELS = [
  'road', 'ground', 'guardrail', 'barrier',
  'car_sport', 'car_muscle', 'car_super',
  'traffic_sedan', 'traffic_hatch', 'traffic_suv',
  'traffic_truck', 'traffic_bus',
  'palm', 'cactus', 'rock', 'mesa', 'lamp', 'billboard', 'cone',
  'coin', 'nitro',
];

const MAX_FRAME = 1 / 20;        // clamp dt so a stall cannot teleport the car

class Game {
  constructor() {
    this.state = 'loading';
    this.clock = new THREE.Clock();
    this.time = 0;
    this.run = null;
  }

  async boot() {
    save.load();
    this.hud = new Hud({
      onPlay: () => this.startRun(),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onQuit: () => this.toMenu(),
      onSelectCar: (car) => this.equip(car),
      onAutoThrottle: (value) => input.setAutoThrottle(value),
      onTilt: (value) => this.setTilt(value),
    });
    this.hud.show('loading');

    this.setupRenderer();
    await assets.loadManifest();
    await assets.loadAll(MODELS, (done, total, name) => {
      this.hud.setProgress(done, total, name);
    });

    this.world = new World(this.scene, this.renderer);
    this.world.build(Math.random() < 0.5 ? 'dusk' : 'day');

    this.lanes = assets.manifest.road.laneCenters;
    this.roadHalfWidth = assets.manifest.road.edgeX;

    this.player = new Player(this.scene, this.world);
    this.equip(this.currentCar());
    this.traffic = new Traffic(this.scene, this.world, this.lanes);
    this.pickups = new Pickups(this.scene, this.lanes);

    input.init({
      surface: document.getElementById('surface'),
      left: document.getElementById('btn-left'),
      right: document.getElementById('btn-right'),
      brake: document.getElementById('btn-brake'),
      gas: document.getElementById('btn-gas'),
      nitro: document.getElementById('btn-nitro'),
    }, { autoThrottle: save.get().settings.autoThrottle });

    audio.setEnabled(save.get().settings.sound);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    // Audio has to be created from a gesture; the first tap anywhere does it.
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

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovPortrait, 1, 0.5, 900);
    this.camera.position.set(0, CAMERA.height, CAMERA.distance);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.baseFov = height > width ? CAMERA.fovPortrait : CAMERA.fovLandscape;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  currentCar() {
    const id = save.get().selectedCar;
    return CARS.find((car) => car.id === id) || CARS[0];
  }

  equip(car) {
    this.player.setCar(car);
    if (this.state === 'menu') this.poseForMenu();
  }

  /** Park the car in shot so the menu has something to look at. */
  poseForMenu() {
    this.player.reset();
    this.player.group.position.set(this.lanes[1], 0, 0);
    this.player.x = this.lanes[1];
    this.menuAngle = 0.6;
    this.updateMenuCamera(0);
  }

  /**
   * Slow orbit around the parked car behind the menu. The camera aims below
   * the car so it rides high in frame, clear of the bottom-anchored panel.
   */
  updateMenuCamera(dt) {
    this.menuAngle = (this.menuAngle || 0) + dt * 0.16;
    const centre = this.lanes[1];
    const radius = 9.6;
    this.camera.position.set(
      centre + Math.sin(this.menuAngle) * radius,
      2.9 + Math.sin(this.menuAngle * 0.7) * 0.4,
      Math.cos(this.menuAngle) * radius);
    this.camera.lookAt(centre, -0.7, 0);
    if (Math.abs(this.camera.fov - this.baseFov) > 0.05) {
      this.camera.fov += (this.baseFov - this.camera.fov) * 0.1;
      this.camera.updateProjectionMatrix();
    }
  }

  toMenu() {
    this.state = 'menu';
    audio.stopEngine();
    input.reset();
    this.traffic?.reset();
    this.pickups?.reset(0);
    this.poseForMenu();
    this.hud.show('menu');
  }

  startRun() {
    audio.unlock();
    audio.setEnabled(save.get().settings.sound);
    this.player.setCar(this.currentCar());
    // start in a lane rather than astride the centre line
    this.player.start(this.lanes[this.lanes.length - 2]);
    this.traffic.reset();
    this.pickups.reset(0);
    input.reset();
    input.recentreTilt();

    this.run = {
      score: 0, coins: 0, overtakes: 0, nearMisses: 0, distance: 0,
    };
    this.state = 'playing';
    this.hud.showPlaying();
    this.hud.updateHud(this.hudState());
    audio.startEngine();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    audio.stopEngine();
    input.reset();
    this.hud.show('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.showPlaying();
    audio.startEngine();
  }

  async setTilt(enabled) {
    if (!enabled) {
      input.disableTilt();
      this.hud.setTiltState(false);
      return;
    }
    const granted = await input.enableTilt();
    this.hud.setTiltState(granted);
    if (!granted) this.hud.toast('Bu cihazda eğim desteği yok');
  }

  endRun() {
    this.state = 'over';
    audio.stopEngine();
    const previousBest = save.get().best;
    save.addCoins(this.run.coins);
    save.recordRun(this.run.score, this.run.distance);
    this.hud.showGameOver({
      score: this.run.score,
      distance: this.run.distance,
      coins: this.run.coins,
      isBest: this.run.score > previousBest,
    });
  }

  hudState() {
    return {
      kmh: this.player.kmh,
      score: this.run ? this.run.score : 0,
      coins: this.run ? this.run.coins : 0,
      distance: this.player.distance,
      nitro: this.player.nitro,
      boosting: this.player.boosting,
    };
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(this.clock.getDelta(), MAX_FRAME);
    this.time += dt;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'over') this.updateAfterCrash(dt);
    else if (this.state === 'menu' || this.state === 'garage') {
      this.updateMenuCamera(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const controls = input.sample();
    // `autopilot` is a test hook: automated runs steer through this so the
    // real input path stays untouched.
    if (typeof this.autopilot === 'number') controls.steer = this.autopilot;
    if (this.autobrake) { controls.brake = true; controls.throttle = 0; }
    if (input.consumeNitro()) this.player.requestBoost();

    const travelled = this.player.update(dt, controls, this.roadHalfWidth);
    if (this.player.scraping) audio.scrape();

    const difficulty = Math.min(1,
      this.player.distance / TRAFFIC.densityRampMetres);

    const events = this.traffic.update(dt, this.player.z, this.player.x,
                                       this.player.size.width * 0.5, difficulty);
    const picked = this.pickups.update(dt, this.player.z, this.player.x,
                                       this.time);

    // --- scoring -----------------------------------------------------------
    const speedBonus = 1 + Math.max(0,
      (this.player.speed - SCORE.speedBonusFrom) / SCORE.speedBonusFrom);
    this.run.score += travelled * SCORE.perMetre * speedBonus;
    this.run.score += events.overtakes * SCORE.overtake;
    this.run.score += events.nearMisses * SCORE.nearMiss;
    this.run.overtakes += events.overtakes;
    this.run.nearMisses += events.nearMisses;
    this.run.coins += picked.coins * SCORE.coinValue;
    this.run.distance = this.player.distance;
    if (events.nearMisses) {
      audio.nearMiss();
      this.hud.toast('Kıl payı! +' + events.nearMisses * SCORE.nearMiss, 0.9);
    }
    if (picked.nitro) {
      this.player.addNitro(picked.nitro * PLAY.nitroPerPickup);
      this.hud.toast('Nitro dolduruldu!', 1.0);
    }

    this.world.update(this.player.z);
    if (this.collides()) {
      this.player.crash();
      this.endRun();
    }

    audio.updateEngine(controls.throttle, this.player.speedRatio,
                       this.player.boosting);
    this.updateCamera(dt);
    this.hud.updateHud(this.hudState());
    this.maybeRebase();
  }

  updateAfterCrash(dt) {
    this.player.update(dt, { steer: 0, throttle: 0, brake: true },
                       this.roadHalfWidth);
    this.world.update(this.player.z);
    this.updateCamera(dt);
  }

  collides() {
    const me = this.player.box;
    for (const car of this.traffic.active) {
      const position = car.holder.position;
      if (Math.abs(position.z - me.z) >= (car.size.length + me.length) * 0.5) {
        continue;
      }
      if (Math.abs(position.x - me.x) < (car.size.width + me.width) * 0.5) {
        return true;
      }
    }
    return false;
  }

  updateCamera(dt) {
    const player = this.player;
    const follow = 1 - Math.exp(-CAMERA.lerp * dt);
    const targetX = player.x * 0.72;

    // Follow distance is held exactly. Smoothing z as well would leave the
    // camera trailing by speed/lerp metres -- 14 m at top speed -- which
    // shrinks the car and steals the sense of pace at the worst moment.
    this.camera.position.z = player.z + CAMERA.distance;
    this.camera.position.x += (targetX - this.camera.position.x) * follow;
    this.camera.position.y += (CAMERA.height - this.camera.position.y) * follow;

    if (player.shake > 0.001) {
      const amount = player.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * amount;
      this.camera.position.y += (Math.random() - 0.5) * amount;
    }

    this.camera.lookAt(player.x * 0.85, CAMERA.lookHeight,
                       player.z - CAMERA.lookAhead);

    const fov = this.baseFov + CAMERA.speedFovBoost * player.speedRatio
      + (player.boosting ? 5 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  /** Keep world coordinates small so long runs stay free of float jitter. */
  maybeRebase() {
    if (this.player.z > -WORLD.rebaseAt) return;
    const offset = this.player.z;
    this.player.rebase(offset);
    this.traffic.rebase(offset);
    this.pickups.rebase(offset);
    this.world.rebase(offset);
    this.camera.position.z -= offset;
  }
}

const game = new Game();
game.boot().catch((error) => {
  console.error(error);
  const label = document.getElementById('loading-label');
  if (label) label.textContent = 'Yükleme hatası: ' + error.message;
});

window.game = game;      // handy for debugging from the console
