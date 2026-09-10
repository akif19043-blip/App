/**
 * The traffic-racer mode: an endless one-way highway.
 *
 * Kept alongside the free-roam city as a second, score-attack mode. It owns
 * its own THREE.Scene, so switching modes is just switching which scene the
 * renderer draws.
 */

import * as THREE from 'three';

import * as assets from './assets.js';
import * as environment from './environment.js';
import * as audio from './audio.js';
import { Pickups } from './pickups.js';
import { Weather } from './weather.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { World } from './world.js';
import { t } from './i18n.js';
import { CAMERA, PICKUPS, PLAY, SCORE, TRAFFIC, WORLD } from './config.js';

export class HighwaySession {
  constructor(renderer, hud) {
    this.renderer = renderer;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.menuAngle = 0.6;
    this.rigScale = 1;
    this.over = false;
  }

  build(timeOfDay) {
    this.world = new World(this.scene, this.renderer);
    this.world.build(timeOfDay);
    this.lanes = assets.manifest.road.laneCenters;
    this.roadHalfWidth = assets.manifest.road.edgeX;
    this.player = new Player(this.scene, this.world);
    this.traffic = new Traffic(this.scene, this.world, this.lanes);
    this.pickups = new Pickups(this.scene, this.lanes);
    // After the road is built, so the asphalt it wets down is in the scene.
    this.weather = new Weather(this.scene);
  }

  /**
   * Rain on the motorway. There is no braking model here to lengthen, so
   * grip goes where it can be felt: the lateral move that dodges traffic.
   */
  setWeather(name) {
    if (!this.weather || name === this.weather.name) return;
    this.weather.set(name);
    this.world.setRaining(this.weather.raining);
    this.player.setHeadlights(!!this.world.preset.headlights);
  }

  setTimeOfDay(name) {
    this.world.setTimeOfDay(name);
    this.player.setHeadlights(!!environment.preset(name).headlights);
  }

  poseCar(carSpec) {
    this.player.setCar(carSpec);
    this.player.setHeadlights(!!environment.preset(this.world.timeOfDay).headlights);
    this.player.reset();
    this.player.x = this.lanes[1];
    this.player.group.position.set(this.lanes[1], 0, 0);
    this.traffic.reset();
    this.pickups.reset(0);
    this.over = false;
  }

  start(carSpec) {
    this.player.setCar(carSpec);
    // start in a lane rather than astride the centre line
    this.player.start(this.lanes[this.lanes.length - 2]);
    this.traffic.reset();
    this.pickups.reset(0);
    this.run = { score: 0, coins: 0, overtakes: 0, nearMisses: 0, distance: 0 };
    this.over = false;
  }

  update(dt, controls, time) {
    if (this.over) {
      this.player.update(dt, { steer: 0, throttle: 0, brake: true },
                         this.roadHalfWidth);
      this.world.update(this.player.z, this.player.x);
      return this.hudState();
    }

    this.weather.update(dt, this.player.x, this.player.z);
    this.player.grip = this.weather.grip;
    audio.setRain(this.weather.rainAmount);

    const travelled = this.player.update(dt, controls, this.roadHalfWidth);
    if (this.player.scraping) audio.scrape();

    const difficulty = Math.min(1,
      this.player.distance / TRAFFIC.densityRampMetres);
    const events = this.traffic.update(dt, this.player.z, this.player.x,
                                       this.player.size.width * 0.5, difficulty);
    const picked = this.pickups.update(dt, this.player.z, this.player.x, time);

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
      this.hud.toast(
        t('toast.nearMiss', { points: events.nearMisses * SCORE.nearMiss }), 0.9);
    }
    if (picked.nitro) {
      this.player.addNitro(picked.nitro * PLAY.nitroPerPickup);
      this.hud.toast(t('toast.nitroFull'), 1.0);
    }

    this.world.update(this.player.z, this.player.x);
    if (this.collides()) {
      this.player.crash();
      this.over = true;
    }
    this.maybeRebase();
    return this.hudState();
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

  requestBoost() {
    return this.player.requestBoost();
  }

  updateCamera(dt, camera) {
    const player = this.player;
    const follow = 1 - Math.exp(-CAMERA.lerp * dt);
    const targetX = player.x * 0.72;

    // Follow distance is held exactly. Smoothing z as well would leave the
    // camera trailing by speed/lerp metres -- 14 m at top speed -- which
    // shrinks the car and steals the sense of pace at the worst moment.
    camera.position.z = player.z + CAMERA.distance * this.rigScale;
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y +=
      (CAMERA.height * this.rigScale - camera.position.y) * follow;

    if (player.shake > 0.001) {
      const amount = player.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * amount;
      camera.position.y += (Math.random() - 0.5) * amount;
    }
    camera.lookAt(player.x * 0.85, CAMERA.lookHeight,
                  player.z - CAMERA.lookAhead);
  }

  applyQuality(level) {
    if (this.scene.fog) {
      this.scene.fog.far = this.world.preset.fogFar * level.draw;
    }
  }

  cameraFov(baseFov) {
    return baseFov + CAMERA.speedFovBoost * this.player.speedRatio
      + (this.player.boosting ? 5 : 0);
  }

  poseForMenu(dt, camera, baseFov) {
    this.menuAngle += dt * 0.16;
    const centre = this.lanes[1];
    const radius = 9.6;
    camera.position.set(
      centre + Math.sin(this.menuAngle) * radius,
      2.9 + Math.sin(this.menuAngle * 0.7) * 0.4,
      Math.cos(this.menuAngle) * radius);
    camera.lookAt(centre, -0.7, 0);
    if (Math.abs(camera.fov - baseFov) > 0.05) {
      camera.fov += (baseFov - camera.fov) * 0.1;
      camera.updateProjectionMatrix();
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
    this.cameraRebase = offset;
  }
}
