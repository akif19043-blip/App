/**
 * Traffic: a fixed pool of vehicles recycled down the road ahead of the player.
 *
 * Cars hold their lane -- no lane changes -- so every crash is the player's
 * mistake and never an unavoidable ambush. Difficulty comes from density and
 * from the spread of speeds, not from unpredictability.
 */

import * as THREE from 'three';
import * as assets from './assets.js';
import * as environment from './environment.js';
import { PLAY, SCORE, TRAFFIC, TRAFFIC_COLORS, TRAFFIC_MODELS }
  from './config.js';

const POOL_PER_MODEL = 4;

export class Traffic {
  constructor(scene, world, laneCenters) {
    this.scene = scene;
    this.world = world;
    this.lanes = laneCenters;
    this.pool = [];
    this.active = [];
    this.buildPool();
  }

  buildPool() {
    const models = TRAFFIC_MODELS.light.concat(TRAFFIC_MODELS.heavy);
    let colorIndex = 0;
    for (const model of models) {
      const heavy = TRAFFIC_MODELS.heavy.indexOf(model) !== -1;
      for (let i = 0; i < POOL_PER_MODEL; i += 1) {
        const color = TRAFFIC_COLORS[colorIndex % TRAFFIC_COLORS.length];
        colorIndex += 1;
        const mesh = environment.shadowRole(
          assets.tintPaint(assets.instance(model), color), 'cast');
        const size = assets.footprint(model, PLAY.collisionShrink);

        const holder = new THREE.Group();
        holder.add(mesh);
        holder.add(this.world.makeShadow(size.width, size.length));
        holder.visible = false;
        this.scene.add(holder);

        this.pool.push({
          model, heavy, holder, mesh, size,
          wheels: assets.wheels(mesh),
          wheelRadius: heavy ? 0.5 : 0.32,
          inUse: false, speed: 0, lane: 0, passed: false, roll: 0,
        });
      }
    }
  }

  reset() {
    for (const car of this.active) {
      car.inUse = false;
      car.holder.visible = false;
    }
    this.active.length = 0;
  }

  take(heavy) {
    const candidates = this.pool.filter(
      (car) => !car.inUse && car.heavy === heavy);
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * True when adding a car in `lane` at `z` would leave no lane open across
   * that stretch of road. Traffic never changes lanes, so a wall built at
   * spawn time is a crash the player could not have avoided.
   */
  wouldBlockEveryLane(lane, z) {
    const window = 32;
    const occupied = new Set([lane]);
    for (const car of this.active) {
      if (Math.abs(car.holder.position.z - z) < window + car.size.length * 0.5) {
        occupied.add(car.lane);
      }
    }
    return occupied.size >= this.lanes.length;
  }

  /** True when `z` in `lane` is clear enough to drop a new car into. */
  laneIsClear(lane, z, length) {
    for (const car of this.active) {
      if (car.lane !== lane) continue;
      const gap = Math.abs(car.holder.position.z - z);
      if (gap < TRAFFIC.gapMin + (car.size.length + length) * 0.5) return false;
    }
    return true;
  }

  spawn(playerZ, difficulty) {
    const heavy = Math.random() < TRAFFIC.heavyChance;
    const car = this.take(heavy);
    if (!car) return false;

    // Heavy vehicles keep to the two right-hand (slower) lanes.
    const laneChoices = heavy
      ? [this.lanes.length - 2, this.lanes.length - 1]
      : this.lanes.map((_, i) => i);
    const lane = laneChoices[Math.floor(Math.random() * laneChoices.length)];

    const z = playerZ - TRAFFIC.spawnAhead
      - Math.random() * TRAFFIC.spawnSpread;
    if (!this.laneIsClear(lane, z, car.size.length)) return false;
    if (this.wouldBlockEveryLane(lane, z)) return false;

    const range = heavy ? TRAFFIC.heavySpeedRange : TRAFFIC.speedRange;
    // Faster, more varied traffic the further the player gets.
    const spread = 0.55 + 0.45 * difficulty;
    car.speed = range[0] + (range[1] - range[0])
      * (1 - Math.random() * spread);
    car.lane = lane;
    car.passed = false;
    car.inUse = true;
    car.holder.position.set(this.lanes[lane], 0, z);
    car.holder.visible = true;
    this.active.push(car);
    return true;
  }

  /**
   * @returns {{overtakes:number, nearMisses:number}} events this frame
   */
  update(dt, playerZ, playerX, playerHalfWidth, difficulty) {
    const target = Math.round(TRAFFIC.minCars
      + (TRAFFIC.maxCars - TRAFFIC.minCars) * difficulty);

    let attempts = 0;
    while (this.active.length < target && attempts < 6) {
      if (!this.spawn(playerZ, difficulty)) attempts += 1;
    }

    const events = { overtakes: 0, nearMisses: 0 };
    const behind = playerZ + 70;

    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const car = this.active[i];
      car.holder.position.z -= car.speed * dt;

      car.roll -= (car.speed / car.wheelRadius) * dt;
      for (const wheel of car.wheels.all) wheel.rotation.x = car.roll;

      if (!car.passed && car.holder.position.z > playerZ) {
        car.passed = true;
        events.overtakes += 1;
        const clearance = Math.abs(car.holder.position.x - playerX)
          - (car.size.width + playerHalfWidth * 2) * 0.5;
        if (clearance < SCORE.nearMissDistance) events.nearMisses += 1;
      }

      if (car.holder.position.z > behind) {
        car.inUse = false;
        car.holder.visible = false;
        this.active.splice(i, 1);
      }
    }
    return events;
  }

  rebase(offset) {
    for (const car of this.active) car.holder.position.z -= offset;
  }
}
