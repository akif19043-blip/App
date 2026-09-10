/**
 * Heat, and the patrol car that turns up because of it.
 *
 * Until now a crash cost you the speed you were carrying and nothing else,
 * which made the safest way to make money the fastest one too. Heat fixes
 * that: hitting traffic, clouting a building or sitting well over the limit
 * fills a meter, and when it fills a patrol car is dispatched.
 *
 * The patrol drives the street grid rather than steering freely at the car.
 * A greedy Manhattan chase -- at every junction take whichever axis you are
 * furthest from the player on -- always closes in, never clips a building,
 * and costs a handful of lines instead of a pathfinder. It also looks right:
 * a police car that corners round blocks reads as a police car, while one
 * that drives diagonally through a car park reads as a bug.
 */

import * as THREE from 'three';
import * as assets from './assets.js';
import * as audio from './audio.js';
import * as environment from './environment.js';
import * as haptics from './haptics.js';
import { CITY } from './config.js';
import { forwardOf, headingOf } from './city.js';

const LIT = 7.0;
const DIM = 0.02;

export class Police {
  /**
   * @param {THREE.Scene} scene
   * @param {object} city   the manifest's city block, for the street grid
   * @param {Function} random  the session's seeded source
   */
  constructor(scene, city, random) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.tuning = CITY.police;

    this.heat = 0;
    this.state = 'calm';        // 'calm' | 'chasing'
    this.catchTimer = 0;
    this.loseTimer = 0;
    this.flash = 0;
    this.busts = 0;
    this.lastFine = 0;

    this.inner = Math.min(...city.laneOffsets);
    this.outer = Math.max(...city.laneOffsets);

    const mesh = environment.shadowRole(assets.instance('traffic_police'), 'cast');
    const size = assets.footprint('traffic_police', 0.9);
    this.holder = new THREE.Group();
    this.holder.add(mesh);
    this.holder.add(environment.makeShadow(size.width, size.length));
    this.holder.visible = false;
    scene.add(this.holder);

    // The two bar lamps are shared materials, so one write flashes every
    // patrol car there will ever be -- the same trick the signals use.
    this.lamps = {};
    mesh.traverse((node) => {
      if (!node.isMesh) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of list) {
        if (material && /^Police(Red|Blue)$/.test(material.name || '')) {
          this.lamps[material.name] = material;
        }
      }
    });
    this.setLamps(0);

    this.car = { axis: 'x', dir: 1, line: 0, lane: this.inner, along: 0,
                 speed: 0 };
  }

  /** Where the patrol is in the world, or null while it is not out. */
  get position() {
    if (this.state !== 'chasing') return null;
    return this.worldOf();
  }

  get wanted() {
    return this.state === 'chasing';
  }

  worldOf(c = this.car) {
    return c.axis === 'x'
      ? { x: c.along, z: c.line + c.dir * c.lane }
      : { x: c.line - c.dir * c.lane, z: c.along };
  }

  setLamps(phase) {
    const red = this.lamps.PoliceRed;
    const blue = this.lamps.PoliceBlue;
    if (red) red.emissiveIntensity = phase === 1 ? LIT : DIM;
    if (blue) blue.emissiveIntensity = phase === 2 ? LIT : DIM;
  }

  /** A crash, a scrape or a stretch of speeding all push the meter up. */
  add(amount) {
    if (this.state === 'chasing') return;
    this.heat = Math.max(0, Math.min(1, this.heat + amount));
  }

  reset() {
    this.heat = 0;
    this.state = 'calm';
    this.catchTimer = 0;
    this.loseTimer = 0;
    this.holder.visible = false;
    this.setLamps(0);
    audio.setSiren(false);
  }

  /**
   * @param {number} dt
   * @param {{x:number,z:number,speed:number,kmh:number}} car the player
   * @returns {{busted:boolean, escaped:boolean}}
   */
  update(dt, car) {
    const t = this.tuning;
    const result = { busted: false, escaped: false };

    if (this.state === 'calm') {
      if (Math.abs(car.speed) > t.speedLimit) {
        this.add(t.heatWhileSpeeding * dt);
      } else if (this.heat < 1) {
        // A full meter never cools off: lifting off the moment it fills is
        // not enough to un-earn the patrol that is already on its way.
        this.heat = Math.max(0, this.heat - t.heatDecay * dt);
      }
      if (this.heat >= 1) this.dispatch(car);
      return result;
    }

    this.drive(dt, car);
    const at = this.worldOf();
    const gap = Math.hypot(at.x - car.x, at.z - car.z);

    // Flashing runs off the session clock rather than a timer of its own, so
    // it keeps time whatever the frame rate does.
    this.flash += dt;
    this.setLamps(Math.floor(this.flash * 3.4) % 2 === 0 ? 1 : 2);
    audio.setSiren(true, 1 - Math.min(1, gap / t.loseRadius));

    if (gap < t.catchRadius && Math.abs(car.speed) < t.catchSpeed) {
      this.catchTimer += dt;
      if (this.catchTimer >= t.catchTime) {
        this.busts += 1;
        result.busted = true;
        haptics.crash();
        this.reset();
        return result;
      }
    } else {
      this.catchTimer = Math.max(0, this.catchTimer - dt);
    }

    if (gap > t.loseRadius) {
      this.loseTimer += dt;
      if (this.loseTimer >= t.loseTime) {
        result.escaped = true;
        this.reset();
      }
    } else {
      this.loseTimer = 0;
    }
    return result;
  }

  /** Put a patrol on a street near the player, out of sight if it can be. */
  dispatch(car) {
    const lines = this.city.streetLines;
    const [lo, hi] = this.tuning.spawnRadius;
    const limit = this.city.halfExtent - 20;

    let best = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const axis = this.random() < 0.5 ? 'x' : 'z';
      const line = lines[Math.floor(this.random() * lines.length)];
      const dir = this.random() < 0.5 ? 1 : -1;
      const along = (axis === 'x' ? car.x : car.z)
        + (this.random() < 0.5 ? -1 : 1) * (lo + this.random() * (hi - lo));
      if (Math.abs(along) > limit || Math.abs(line) > limit) continue;

      const candidate = { axis, dir, line, lane: this.inner, along, speed: 0 };
      const at = this.worldOf(candidate);
      const gap = Math.hypot(at.x - car.x, at.z - car.z);
      if (!best || Math.abs(gap - lo) < Math.abs(best.gap - lo)) {
        best = { candidate, gap };
      }
    }
    if (!best) return false;

    this.car = best.candidate;
    this.car.speed = this.tuning.chaseSpeed * 0.6;
    this.state = 'chasing';
    this.catchTimer = 0;
    this.loseTimer = 0;
    this.holder.visible = true;
    this.applyTransform();
    return true;
  }

  /**
   * One step of the chase: run along the current street, and at each junction
   * take whichever axis the player is further away on.
   */
  drive(dt, car) {
    const c = this.car;
    const lines = this.city.streetLines;
    const target = c.axis === 'x' ? car.x : car.z;
    const across = c.axis === 'x' ? car.z : car.x;

    // close fast when far behind, ease off when alongside
    const gap = Math.abs(target - c.along);
    const want = this.tuning.chaseSpeed * (gap > 30 ? 1 : 0.72);
    c.speed += Math.sign(want - c.speed) * 18 * dt;

    const before = c.along;
    c.along += c.dir * c.speed * dt;

    // Did we pass a junction this step? Grid arithmetic finds it directly.
    for (const line of lines) {
      const crossed = (before - line) * (c.along - line) <= 0
        && Math.abs(c.along - before) > 1e-6;
      if (!crossed) continue;
      this.atJunction(line, target, across);
      break;
    }

    const limit = this.city.halfExtent - 12;
    c.along = Math.max(-limit, Math.min(limit, c.along));
    this.applyTransform();
  }

  /**
   * Standing at the junction on `line`: keep going, turn, or turn around.
   * `across` is the player's coordinate on the axis we are NOT driving along.
   */
  atJunction(line, target, across) {
    const c = this.car;
    const remainingAlong = Math.abs(target - line);
    const remainingAcross = Math.abs(across - c.line);

    if (remainingAcross > remainingAlong && remainingAcross > 6) {
      // Turn onto the crossing street. The new `along` is the world
      // coordinate we were actually sitting at, lane offset included, so the
      // car pivots on the spot instead of hopping across the road.
      const at = this.worldOf();
      const wasLine = c.line;
      c.axis = c.axis === 'x' ? 'z' : 'x';
      c.line = line;
      c.along = c.axis === 'z' ? at.z : at.x;
      c.dir = Math.sign(across - wasLine) || 1;
      return;
    }
    // carry on, turning around if the player is behind us
    const ahead = (target - c.along) * c.dir;
    if (ahead < -6) c.dir = -c.dir;
  }

  applyTransform() {
    const at = this.worldOf();
    this.holder.position.set(at.x, 0, at.z);
    this.holder.rotation.y = headingOf(forwardOf(this.car.axis, this.car.dir));
  }
}
