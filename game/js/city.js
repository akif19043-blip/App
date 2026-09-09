/**
 * The drivable city.
 *
 * Layout numbers (block size, street width, grid pitch, every street centre
 * line and block centre) come from manifest.json, which Blender wrote when it
 * generated the street mesh -- so the lanes traffic drives in, the kerbs the
 * car collides with and the painted lines on the road are all the same grid.
 *
 * The map is generated from a fixed seed on purpose: a city worth driving
 * around is one you can learn.
 */

import * as THREE from 'three';

import * as assets from './assets.js';
import * as audio from './audio.js';
import * as environment from './environment.js';
import { Car } from './car.js';
import { CITY, DRIVE, TRAFFIC_COLORS, TRAFFIC_MODELS } from './config.js';

const MAP_SEED = 1337;

/** Small deterministic PRNG, so the city is the same city every time. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// --------------------------------------------------------------------------- 
// collision
// --------------------------------------------------------------------------- 

/**
 * Kerbs and the boundary wall.
 *
 * Blocks sit on a regular grid, so the only block a point can be inside is the
 * nearest one -- index arithmetic finds it, no list to search.
 */
export class CityCollider {
  constructor(city) {
    this.pitch = city.pitch;
    this.grid = city.grid;
    this.half = city.block / 2;
    this.bound = city.halfExtent - 1.2;
    this.offset = (city.grid - 1) / 2;
  }

  blockCentre(x, z) {
    const i = Math.min(this.grid - 1, Math.max(0,
      Math.round(x / this.pitch + this.offset)));
    const j = Math.min(this.grid - 1, Math.max(0,
      Math.round(z / this.pitch + this.offset)));
    return [(i - this.offset) * this.pitch, (j - this.offset) * this.pitch];
  }

  /**
   * Push a circle out of whatever it is overlapping.
   * @returns {{x:number,z:number,hit:boolean,nx:number,nz:number}}
   */
  resolve(x, z, radius) {
    const result = { x, z, hit: false, nx: 0, nz: 0 };

    const [bx, bz] = this.blockCentre(x, z);
    const reach = this.half + radius;
    const dx = x - bx;
    const dz = z - bz;
    if (Math.abs(dx) < reach && Math.abs(dz) < reach) {
      // eject along whichever axis is least deep -- that is the face it hit
      const penX = reach - Math.abs(dx);
      const penZ = reach - Math.abs(dz);
      if (penX < penZ) {
        result.x = bx + Math.sign(dx || 1) * reach;
        result.nx = Math.sign(dx || 1);
      } else {
        result.z = bz + Math.sign(dz || 1) * reach;
        result.nz = Math.sign(dz || 1);
      }
      result.hit = true;
    }

    const limit = this.bound - radius;
    if (result.x > limit) { result.x = limit; result.nx = -1; result.hit = true; }
    if (result.x < -limit) { result.x = -limit; result.nx = 1; result.hit = true; }
    if (result.z > limit) { result.z = limit; result.nz = -1; result.hit = true; }
    if (result.z < -limit) { result.z = -limit; result.nz = 1; result.hit = true; }
    return result;
  }
}

// --------------------------------------------------------------------------- 
// traffic
// --------------------------------------------------------------------------- 

/**
 * City traffic: cars driving in the right-hand lanes of the street grid.
 *
 * They hold their street and never turn, which keeps them out of the buildings
 * without needing a junction AI, and recycle to a street near the player once
 * they get too far away.
 */
class CityTraffic {
  constructor(scene, city, random) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.cars = [];

    const models = TRAFFIC_MODELS.light.concat(TRAFFIC_MODELS.heavy);
    for (let i = 0; i < CITY.trafficCars; i += 1) {
      const model = models[i % models.length];
      const colour = TRAFFIC_COLORS[i % TRAFFIC_COLORS.length];
      const mesh = assets.tintPaint(assets.instance(model), colour);
      const size = assets.footprint(model, 0.9);

      const holder = new THREE.Group();
      holder.add(mesh);
      holder.add(environment.makeShadow(size.width, size.length));
      scene.add(holder);

      this.cars.push({
        holder, size, model,
        wheels: assets.wheels(mesh),
        wheelRadius: size.length > 6 ? 0.5 : 0.32,
        axis: 'x', dir: 1, line: 0, lane: 2.25, along: 0, speed: 12, roll: 0,
      });
    }
  }

  /** Put a car on a random street, `distance` metres from (x, z). */
  respawn(car, x, z) {
    const lines = this.city.streetLines;
    const [lo, hi] = CITY.trafficSpawnRadius;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const axis = this.random() < 0.5 ? 'x' : 'z';
      const dir = this.random() < 0.5 ? 1 : -1;
      const line = lines[Math.floor(this.random() * lines.length)];
      const lane = this.city.laneOffsets[
        Math.floor(this.random() * this.city.laneOffsets.length)];
      const along = (axis === 'x' ? x : z)
        + (this.random() < 0.5 ? -1 : 1) * (lo + this.random() * (hi - lo));
      if (Math.abs(along) > this.city.halfExtent - 20) continue;

      car.axis = axis;
      car.dir = dir;
      car.line = line;
      car.lane = lane;
      car.along = along;
      car.speed = CITY.trafficSpeed[0]
        + this.random() * (CITY.trafficSpeed[1] - CITY.trafficSpeed[0]);
      this.applyTransform(car);
      return true;
    }
    return false;
  }

  applyTransform(car) {
    if (car.axis === 'x') {
      car.holder.position.set(car.along, 0, car.line + car.dir * car.lane);
      car.holder.rotation.y = car.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      car.holder.position.set(car.line - car.dir * car.lane, 0, car.along);
      car.holder.rotation.y = car.dir > 0 ? Math.PI : 0;
    }
  }

  reset(x, z) {
    for (const car of this.cars) this.respawn(car, x, z);
  }

  update(dt, x, z) {
    const edge = this.city.halfExtent - 6;
    for (const car of this.cars) {
      car.along += car.dir * car.speed * dt;
      car.roll -= (car.speed / car.wheelRadius) * dt;
      for (const wheel of car.wheels.all) wheel.rotation.x = car.roll;

      const dx = car.holder.position.x - x;
      const dz = car.holder.position.z - z;
      if (Math.abs(car.along) > edge
          || dx * dx + dz * dz > CITY.trafficKeepRadius ** 2) {
        this.respawn(car, x, z);
      } else {
        this.applyTransform(car);
      }
    }
  }

  /** Circle test against the player; returns the car hit, if any. */
  hitTest(x, z, radius) {
    for (const car of this.cars) {
      const dx = car.holder.position.x - x;
      const dz = car.holder.position.z - z;
      const reach = radius + Math.max(car.size.width, car.size.length * 0.5) * 0.5;
      if (dx * dx + dz * dz < reach * reach) return { car, dx, dz, reach };
    }
    return null;
  }
}

// --------------------------------------------------------------------------- 
// the session
// --------------------------------------------------------------------------- 

export class CitySession {
  constructor(renderer, hud) {
    this.renderer = renderer;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.random = makeRandom(MAP_SEED);
    this.lookTarget = new THREE.Vector3();
    this.menuAngle = 0.4;
    this.stats = { coins: 0, collected: 0, deliveries: 0, distance: 0 };
  }

  build(timeOfDay) {
    this.city = assets.manifest.city;
    this.collider = new CityCollider(this.city);

    environment.applySky(this.scene, this.renderer,
                         environment.preset(timeOfDay), CITY.fogRange);
    environment.applyLights(this.scene, environment.preset(timeOfDay));

    this.scene.add(assets.instance('desert_floor'));
    this.scene.add(assets.instance('city_ground'));
    this.buildBlocks();
    this.buildWalls();
    this.buildLamps();
    this.buildCoins();
    this.buildBeacon();

    this.car = new Car(this.scene);
    this.traffic = new CityTraffic(this.scene, this.city, this.random);
  }

  /** Towers in the middle, sheds and parks on the outskirts. */
  buildBlocks() {
    const grid = this.city.grid;
    const middle = (grid - 1) / 2;
    this.blocks = [];

    this.city.blockCenters.forEach(([x, z], index) => {
      const i = index / grid | 0;
      const j = index % grid;
      const ring = Math.max(Math.abs(i - middle), Math.abs(j - middle));
      const roll = this.random();

      let kind;
      if (ring < 1) kind = 'block_downtown';
      else if (ring < 2) kind = roll < 0.55 ? 'block_downtown' : 'block_lowrise';
      else if (roll < 0.45) kind = 'block_lowrise';
      else if (roll < 0.75) kind = 'block_park';
      else kind = 'block_industrial';

      const block = assets.instance(kind);
      block.position.set(x, 0, z);
      block.rotation.y = Math.floor(this.random() * 4) * (Math.PI / 2);
      this.scene.add(block);
      this.blocks.push({ x, z, kind });
    });
  }

  buildWalls() {
    const half = this.city.halfExtent;
    const pitch = this.city.pitch;
    const count = Math.ceil(this.city.extent / pitch);
    const start = -((count - 1) / 2) * pitch;
    for (let n = 0; n < count; n += 1) {
      const along = start + n * pitch;
      for (const side of [-1, 1]) {
        const north = assets.instance('city_wall');
        north.position.set(along, 0, side * half);
        this.scene.add(north);

        const east = assets.instance('city_wall');
        east.position.set(side * half, 0, along);
        east.rotation.y = Math.PI / 2;
        this.scene.add(east);
      }
    }
  }

  buildLamps() {
    if (!CITY.lampsAtIntersections) return;
    const inset = this.city.street / 2 + 1.4;
    for (const lx of this.city.streetLines) {
      for (const lz of this.city.streetLines) {
        const lamp = assets.instance('lamp');
        lamp.position.set(lx + inset, 0, lz + inset);
        lamp.rotation.y = Math.PI * 0.75;    // crane the arm over the junction
        this.scene.add(lamp);
      }
    }
  }

  /** Coins strung along the driving lanes, so following a street pays. */
  buildCoins() {
    this.coins = [];
    const lines = this.city.streetLines;
    const limit = this.city.halfExtent - 14;
    for (let i = 0; i < CITY.coins; i += 1) {
      const object = assets.instance('coin');
      object.visible = true;
      this.scene.add(object);
      this.coins.push({ object, taken: false });
    }
    this.scatterCoins(lines, limit);
  }

  scatterCoins(lines, limit) {
    for (const coin of this.coins) {
      const axis = this.random() < 0.5 ? 'x' : 'z';
      const line = lines[Math.floor(this.random() * lines.length)];
      const lane = (this.random() < 0.5 ? -1 : 1)
        * this.city.laneOffsets[
          Math.floor(this.random() * this.city.laneOffsets.length)];
      const along = (this.random() * 2 - 1) * limit;
      const x = axis === 'x' ? along : line + lane;
      const z = axis === 'x' ? line + lane : along;
      coin.object.position.set(x, CITY.coinHeight, z);
      coin.object.visible = true;
      coin.taken = false;
    }
  }

  buildBeacon() {
    this.beacon = assets.instance('beacon');
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.mission = null;
  }

  /** Pick a junction far enough away to be worth driving to. */
  newMission() {
    const lines = this.city.streetLines;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = lines[Math.floor(this.random() * lines.length)];
      const z = lines[Math.floor(this.random() * lines.length)];
      const dx = x - this.car.x;
      const dz = z - this.car.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 120 && attempt < 20) continue;
      const [lo, hi] = CITY.missionPay;
      this.mission = {
        x, z,
        pay: Math.round(lo + this.random() * (hi - lo)),
      };
      this.beacon.position.set(x, 0, z);
      this.beacon.visible = true;
      return this.mission;
    }
    return null;
  }

  start(carSpec) {
    this.car.setCar(carSpec);
    // Start on the middle street heading north, clear of the kerbs.
    const line = this.city.streetLines[
      Math.floor(this.city.streetLines.length / 2)];
    // Heading 0 faces -Z, whose right-hand side is +X, so the near lane of a
    // north-south street is at line + laneOffset.
    this.car.place(line + this.city.laneOffsets[0], 0, 0);
    this.car.nitro = 0.5;

    this.stats = { coins: 0, collected: 0, deliveries: 0, distance: 0 };
    this.random = makeRandom(MAP_SEED + 7);
    this.scatterCoins(this.city.streetLines, this.city.halfExtent - 14);
    this.traffic.reset(this.car.x, this.car.z);
    this.newMission();
  }

  update(dt, controls, time) {
    const travelled = this.car.update(dt, controls, this.collider);
    this.stats.distance += travelled;

    this.traffic.update(dt, this.car.x, this.car.z);
    this.resolveTrafficContact();
    this.collectCoins(time);
    this.checkMission();

    if (this.beacon.visible) {
      this.beacon.rotation.y = time * 0.8;
      this.beacon.position.y = Math.sin(time * 2) * 0.12;
    }
    return this.hudState();
  }

  resolveTrafficContact() {
    const hit = this.traffic.hitTest(this.car.x, this.car.z, this.car.radius);
    if (!hit) return;
    const distance = Math.max(0.001, Math.hypot(hit.dx, hit.dz));
    const push = (hit.reach - distance) / distance;
    this.car.x -= hit.dx * push;
    this.car.z -= hit.dz * push;
    this.car.group.position.set(this.car.x, 0, this.car.z);
    if (Math.abs(this.car.speed) > 8) {
      this.car.shake = Math.max(this.car.shake, 0.7);
      audio.crash();
    }
    this.car.speed *= 0.35;
  }

  collectCoins(time) {
    const radius = CITY.pickupRadius;
    let picked = 0;
    for (const coin of this.coins) {
      if (coin.taken) continue;
      coin.object.rotation.y = time * 3.0;
      const dx = coin.object.position.x - this.car.x;
      const dz = coin.object.position.z - this.car.z;
      if (dx * dx + dz * dz < radius * radius) {
        coin.taken = true;
        coin.object.visible = false;
        picked += 1;
      }
    }
    if (!picked) return;
    this.stats.coins += picked;
    this.stats.collected += picked;
    audio.coin();
    this.car.addNitro(picked * 0.08);
    if (this.coins.every((coin) => coin.taken)) {
      this.scatterCoins(this.city.streetLines, this.city.halfExtent - 14);
      this.hud.toast('Jetonlar yenilendi!');
    }
  }

  checkMission() {
    if (!this.mission) return;
    const dx = this.mission.x - this.car.x;
    const dz = this.mission.z - this.car.z;
    if (dx * dx + dz * dz > CITY.missionArriveRadius ** 2) return;

    this.stats.coins += this.mission.pay;
    this.stats.deliveries += 1;
    audio.nitro();
    this.car.addNitro(0.5);
    this.hud.toast(`Teslimat tamam! +${this.mission.pay} 🪙`, 2.2);
    this.newMission();
  }

  hudState() {
    const target = this.mission
      ? Math.round(Math.hypot(this.mission.x - this.car.x,
                              this.mission.z - this.car.z))
      : 0;
    return {
      kmh: this.car.kmh,
      coins: this.stats.coins,
      target,
      distance: this.stats.distance,
      nitro: this.car.nitro,
      boosting: this.car.boosting,
      deliveries: this.stats.deliveries,
    };
  }

  updateCamera(dt, camera) {
    const car = this.car;
    const follow = 1 - Math.exp(-DRIVE.cameraLerp * dt);

    // Sit behind the nose, swung a little into the corner so you can see
    // where the car is going rather than where it has been.
    const swing = car.heading + car.steerAngle * DRIVE.cameraTurnLead;
    const desiredX = car.x + Math.sin(swing) * DRIVE.cameraDistance;
    const desiredZ = car.z + Math.cos(swing) * DRIVE.cameraDistance;

    camera.position.x += (desiredX - camera.position.x) * follow;
    camera.position.z += (desiredZ - camera.position.z) * follow;
    camera.position.y += (DRIVE.cameraHeight - camera.position.y) * follow;

    // Keep the camera out of the buildings it would otherwise clip through.
    const clear = this.collider.resolve(camera.position.x, camera.position.z, 1.1);
    camera.position.x = clear.x;
    camera.position.z = clear.z;

    if (car.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * car.shake * 0.4;
      camera.position.y += (Math.random() - 0.5) * car.shake * 0.4;
    }

    const ahead = car.forward().multiplyScalar(DRIVE.cameraLookAhead);
    this.lookTarget.lerp(
      new THREE.Vector3(car.x + ahead.x, DRIVE.cameraLookHeight, car.z + ahead.z),
      Math.min(1, dt * 6));
    camera.lookAt(this.lookTarget);
  }

  /** Slow orbit for the menu backdrop. */
  poseForMenu(dt, camera, baseFov) {
    this.menuAngle += dt * 0.14;
    const radius = 11.6;
    camera.position.set(
      this.car.x + Math.sin(this.menuAngle) * radius,
      3.1 + Math.sin(this.menuAngle * 0.7) * 0.4,
      this.car.z + Math.cos(this.menuAngle) * radius);
    camera.lookAt(this.car.x, -0.6, this.car.z);
    if (Math.abs(camera.fov - baseFov) > 0.05) {
      camera.fov += (baseFov - camera.fov) * 0.1;
      camera.updateProjectionMatrix();
    }
  }

  /** Park the car somewhere photogenic for the menu. */
  poseCar(carSpec) {
    this.car.setCar(carSpec);
    const line = this.city.streetLines[
      Math.floor(this.city.streetLines.length / 2)];
    this.car.place(line + this.city.laneOffsets[0], 0, Math.PI * 0.15);
    this.traffic.reset(this.car.x, this.car.z);
  }
}
