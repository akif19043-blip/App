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
import { Pedestrians } from './pedestrians.js';
import { Signals } from './signals.js';
import { CITY, DRIVE, SHADOWS, TRAFFIC_COLORS, TRAFFIC_MODELS }
  from './config.js';

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
  /**
   * @param {object} city    manifest.city
   * @param {string[]} kinds block kind per entry of city.blockCenters
   */
  constructor(city, kinds) {
    this.pitch = city.pitch;
    this.grid = city.grid;
    this.half = city.block / 2;
    this.bound = city.halfExtent - 1.2;
    this.offset = (city.grid - 1) / 2;
    this.shapes = city.blockShapes || { solid: [[0, 0, this.half, this.half]] };
    this.kinds = kinds || [];
  }

  blockIndex(x, z) {
    const i = Math.min(this.grid - 1, Math.max(0,
      Math.round(x / this.pitch + this.offset)));
    const j = Math.min(this.grid - 1, Math.max(0,
      Math.round(z / this.pitch + this.offset)));
    return { i, j, index: i * this.grid + j };
  }

  blockCentre(x, z) {
    const { i, j } = this.blockIndex(x, z);
    return [(i - this.offset) * this.pitch, (j - this.offset) * this.pitch];
  }

  /** Obstacles of the nearest block, in block-local metres. */
  shapesAt(x, z) {
    const kind = this.kinds[this.blockIndex(x, z).index];
    return this.shapes[kind] || this.shapes.solid;
  }

  /**
   * Push a circle out of whatever it is overlapping.
   *
   * Blocks sit on a regular grid, so the only block a point can be inside is
   * the nearest one -- index arithmetic finds it, no list to search. Most
   * blocks are a single box; the car park is a handful, which is what lets the
   * player drive into it.
   *
   * @returns {{x:number,z:number,hit:boolean,nx:number,nz:number}}
   */
  resolve(x, z, radius) {
    const result = { x, z, hit: false, nx: 0, nz: 0 };
    const [bx, bz] = this.blockCentre(x, z);

    for (const [sx, sz, hx, hz] of this.shapesAt(x, z)) {
      const cx = bx + sx;
      const cz = bz + sz;
      const reachX = hx + radius;
      const reachZ = hz + radius;
      const dx = result.x - cx;
      const dz = result.z - cz;
      if (Math.abs(dx) >= reachX || Math.abs(dz) >= reachZ) continue;

      // eject along whichever axis is least deep -- that is the face it hit
      if (reachX - Math.abs(dx) < reachZ - Math.abs(dz)) {
        result.x = cx + Math.sign(dx || 1) * reachX;
        result.nx = Math.sign(dx || 1);
      } else {
        result.z = cz + Math.sign(dz || 1) * reachZ;
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
 * City traffic.
 *
 * Cars hold a lane, obey the junction signals, queue behind whoever is in
 * front of them, and take the occasional turn at a green light. A turn is
 * driven along a real quarter-circle arc and only ever ends on a valid lane of
 * the crossing street, which is what keeps them out of the buildings without
 * any collision testing.
 */

const RIGHT_RADIUS = 3.0;
const LEFT_RADIUS = 12.0;
const TURN_SPEED = 7.5;
const STOP_LINE_INSET = 1.4;      // metres back from the kerb line
const COMFORT_DECEL = 4.0;
const ACCEL = 3.2;
const FOLLOW_GAP = 3.0;

/** Unit forward vector for a lane direction. */
function forwardOf(axis, dir) {
  return axis === 'x' ? { x: dir, z: 0 } : { x: 0, z: dir };
}

/** 90 degrees clockwise from `f` in world terms: the driver's right. */
function rightOf(f) {
  return { x: -f.z, z: f.x };
}

/** rotation.y for a forward vector, matching the models' -Z facing. */
function headingOf(f) {
  return Math.atan2(-f.x, -f.z);
}

class CityTraffic {
  constructor(scene, city, random) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.cars = [];
    this.inner = Math.min(...city.laneOffsets);
    this.outer = Math.max(...city.laneOffsets);
    this.stopInset = city.street / 2 + STOP_LINE_INSET;

    const models = TRAFFIC_MODELS.light.concat(TRAFFIC_MODELS.heavy);
    for (let i = 0; i < CITY.trafficCars; i += 1) {
      const model = models[i % models.length];
      const colour = TRAFFIC_COLORS[i % TRAFFIC_COLORS.length];
      const mesh = environment.shadowRole(
        assets.tintPaint(assets.instance(model), colour), 'cast');
      const size = assets.footprint(model, 0.9);

      const holder = new THREE.Group();
      holder.add(mesh);
      holder.add(environment.makeShadow(size.width, size.length));
      scene.add(holder);

      this.cars.push({
        holder, size, model,
        wheels: assets.wheels(mesh),
        wheelRadius: size.length > 6 ? 0.5 : 0.32,
        axis: 'x', dir: 1, line: 0, lane: this.inner, along: 0,
        cruise: 12, speed: 12, roll: 0,
        plan: null, planLine: null, turn: null,
      });
    }
  }

  /** World position implied by a car's lane state. */
  worldOf(car) {
    return car.axis === 'x'
      ? { x: car.along, z: car.line + car.dir * car.lane }
      : { x: car.line - car.dir * car.lane, z: car.along };
  }

  /** Put a car on a random street, well away from (x, z). */
  respawn(car, x, z) {
    const lines = this.city.streetLines;
    const [lo, hi] = CITY.trafficSpawnRadius;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const axis = this.random() < 0.5 ? 'x' : 'z';
      const dir = this.random() < 0.5 ? 1 : -1;
      const line = lines[Math.floor(this.random() * lines.length)];
      const lane = this.random() < 0.5 ? this.inner : this.outer;
      const along = (axis === 'x' ? x : z)
        + (this.random() < 0.5 ? -1 : 1) * (lo + this.random() * (hi - lo));
      if (Math.abs(along) > this.city.halfExtent - 20) continue;

      car.axis = axis;
      car.dir = dir;
      car.line = line;
      car.lane = lane;
      car.along = along;
      car.cruise = CITY.trafficSpeed[0]
        + this.random() * (CITY.trafficSpeed[1] - CITY.trafficSpeed[0]);
      car.speed = car.cruise;
      car.turn = null;
      car.plan = null;
      car.planLine = null;
      this.applyTransform(car);
      return true;
    }
    return false;
  }

  applyTransform(car) {
    const at = this.worldOf(car);
    car.holder.position.set(at.x, 0, at.z);
    car.holder.rotation.y = headingOf(forwardOf(car.axis, car.dir));
  }

  reset(x, z) {
    for (const car of this.cars) this.respawn(car, x, z);
  }

  /** Coordinate of the next junction ahead, along the car's own axis. */
  nextCrossing(car) {
    let best = null;
    for (const line of this.city.streetLines) {
      const ahead = (line - car.along) * car.dir;
      if (ahead > 0 && (best === null || ahead < best.ahead)) {
        best = { line, ahead };
      }
    }
    return best;
  }

  /** Decide once per junction whether this car will turn there. */
  planFor(car, crossing) {
    if (!crossing || car.planLine === crossing.line) return;
    car.planLine = crossing.line;
    const roll = this.random();
    if (car.lane === this.outer && roll < 0.35) car.plan = 'right';
    else if (car.lane === this.inner && roll < 0.25) car.plan = 'left';
    else car.plan = null;
  }

  /** Where along the street a planned turn begins. */
  turnEntry(car) {
    if (!car.plan || car.planLine === null) return null;
    return car.plan === 'right'
      ? car.planLine - car.dir * (this.outer + RIGHT_RADIUS)
      : car.planLine + car.dir * (this.inner - LEFT_RADIUS);
  }

  /**
   * Speed this car is allowed right now: the lower of its cruise, what the
   * signal ahead permits, and what the car in front permits.
   */
  allowedSpeed(car, signals) {
    let allowed = car.turn ? Math.min(car.cruise, TURN_SPEED) : car.cruise;

    const crossing = this.nextCrossing(car);
    if (!car.turn && crossing && signals) {
      const state = signals.stateFor(car.axis);
      const toStop = crossing.ahead - this.stopInset;
      // An amber is only worth stopping for if there is room to stop.
      const mustStop = state === 'red'
        || (state === 'amber' && toStop > car.speed * 0.9);
      if (mustStop && toStop > -1.0) {
        allowed = Math.min(allowed,
          Math.sqrt(2 * COMFORT_DECEL * Math.max(0, toStop)));
      }
    }

    const leader = this.leaderFor(car);
    if (leader) {
      const gap = leader.gap - (car.size.length + leader.car.size.length) * 0.5;
      allowed = Math.min(allowed,
        Math.max(0, leader.car.speed + (gap - FOLLOW_GAP) * 1.1));
    }
    return Math.max(0, allowed);
  }

  leaderFor(car) {
    let best = null;
    for (const other of this.cars) {
      if (other === car || other.turn) continue;
      if (other.axis !== car.axis || other.dir !== car.dir) continue;
      if (other.line !== car.line || other.lane !== car.lane) continue;
      const gap = (other.along - car.along) * car.dir;
      if (gap > 0 && gap < 26 && (!best || gap < best.gap)) {
        best = { car: other, gap };
      }
    }
    return best;
  }

  /** Begin a quarter-circle turn onto the crossing street. */
  startTurn(car) {
    const sign = car.plan === 'right' ? 1 : -1;
    const radius = car.plan === 'right' ? RIGHT_RADIUS : LEFT_RADIUS;
    const lane = car.plan === 'right' ? this.outer : this.inner;

    const forward = forwardOf(car.axis, car.dir);
    const right = rightOf(forward);
    const at = this.worldOf(car);
    const centre = {
      x: at.x + sign * radius * right.x,
      z: at.z + sign * radius * right.z,
    };
    const exitForward = { x: sign * right.x, z: sign * right.z };
    const exitRight = rightOf(exitForward);
    const exit = {
      x: centre.x - sign * radius * exitRight.x,
      z: centre.z - sign * radius * exitRight.z,
    };

    const axis = car.axis === 'x' ? 'z' : 'x';
    const dir = axis === 'x' ? exitForward.x : exitForward.z;
    const speed = Math.min(car.cruise, TURN_SPEED);

    car.turn = {
      centre,
      radius,
      a0: Math.atan2(at.z - centre.z, at.x - centre.x),
      sweep: sign * Math.PI / 2,
      t: 0,
      duration: (radius * Math.PI / 2) / Math.max(speed, 2),
      exit: {
        axis, dir, line: car.planLine, lane,
        along: axis === 'x' ? exit.x : exit.z,
      },
    };
    car.plan = null;
    car.speed = speed;
  }

  advanceTurn(car, dt) {
    const turn = car.turn;
    turn.t += dt;
    const t = Math.min(1, turn.t / turn.duration);
    const angle = turn.a0 + turn.sweep * t;

    car.holder.position.set(
      turn.centre.x + Math.cos(angle) * turn.radius, 0,
      turn.centre.z + Math.sin(angle) * turn.radius);
    // Tangent to the arc, in the direction of travel.
    const sign = Math.sign(turn.sweep);
    car.holder.rotation.y = headingOf({
      x: -Math.sin(angle) * sign,
      z: Math.cos(angle) * sign,
    });

    if (t < 1) return;
    Object.assign(car, turn.exit);
    car.turn = null;
    car.planLine = null;
    this.applyTransform(car);
  }

  update(dt, x, z, signals) {
    const edge = this.city.halfExtent - 6;

    for (const car of this.cars) {
      const target = this.allowedSpeed(car, signals);
      const rate = target > car.speed ? ACCEL : COMFORT_DECEL * 1.6;
      car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed));
      car.speed = Math.max(0, car.speed);

      car.roll -= (car.speed / car.wheelRadius) * dt;
      for (const wheel of car.wheels.all) wheel.rotation.x = car.roll;

      if (car.turn) {
        this.advanceTurn(car, dt);
      } else {
        car.along += car.dir * car.speed * dt;
        const crossing = this.nextCrossing(car);
        this.planFor(car, crossing);

        const entry = this.turnEntry(car);
        if (entry !== null && (car.along - entry) * car.dir >= 0) {
          // Only turn on a green; otherwise carry straight on through.
          if (signals && signals.isGreen(car.axis)) {
            car.along = entry;
            this.startTurn(car);
          } else {
            car.plan = null;
          }
        }
        if (!car.turn) this.applyTransform(car);
      }

      const dx = car.holder.position.x - x;
      const dz = car.holder.position.z - z;
      if (Math.abs(car.along) > edge
          || dx * dx + dz * dz > CITY.trafficKeepRadius ** 2) {
        this.respawn(car, x, z);
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
    this.reverseBlend = 0;
    this.rigScale = 1;
    this.stats = { coins: 0, collected: 0, deliveries: 0, onTime: 0,
                   distance: 0 };
  }

  build(timeOfDay) {
    this.city = assets.manifest.city;

    environment.applySky(this.scene, this.renderer,
                         environment.preset(timeOfDay), CITY.fogRange);
    const lights = environment.applyLights(this.scene,
                                           environment.preset(timeOfDay),
                                           SHADOWS);
    this.sun = lights.sun;

    // The ground only receives; nothing about it can cast anything useful.
    this.scene.add(environment.shadowRole(
      assets.instance('desert_floor'), 'receive'));
    this.scene.add(environment.shadowRole(
      assets.instance('city_ground'), 'receive'));
    this.buildBlocks();
    // The collider needs to know which kind sits where: most blocks are solid,
    // the car park is not.
    this.collider = new CityCollider(this.city,
                                     this.blocks.map((block) => block.kind));
    this.buildWalls();
    this.buildLamps();
    this.buildSignals();
    this.buildCoins();
    this.buildBeacon();

    this.car = new Car(this.scene);
    this.traffic = new CityTraffic(this.scene, this.city, this.random);
    this.pedestrians = new Pedestrians(this.scene, this.city, this.random);
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
      else if (ring < 2) {
        kind = roll < 0.5 ? 'block_downtown'
          : (roll < 0.72 ? 'block_lowrise' : 'block_parking');
      } else if (roll < 0.38) kind = 'block_lowrise';
      else if (roll < 0.62) kind = 'block_park';
      else if (roll < 0.82) kind = 'block_industrial';
      else kind = 'block_parking';

      const block = environment.shadowRole(assets.instance(kind), 'both');
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
        const north = environment.shadowRole(
          assets.instance('city_wall'), 'cast');
        north.position.set(along, 0, side * half);
        this.scene.add(north);

        const east = environment.shadowRole(
          assets.instance('city_wall'), 'cast');
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
        const lamp = environment.shadowRole(assets.instance('lamp'), 'cast');
        lamp.position.set(lx + inset, 0, lz + inset);
        lamp.rotation.y = Math.PI * 0.75;    // crane the arm over the junction
        this.scene.add(lamp);
      }
    }
  }

  /**
   * A signal post on one corner of every junction. They all share the six lamp
   * materials, so `Signals` drives the whole city through the first instance.
   */
  buildSignals() {
    const inset = this.city.street / 2 + 1.5;
    let first = null;
    for (const lx of this.city.streetLines) {
      for (const lz of this.city.streetLines) {
        const post = environment.shadowRole(
          assets.instance('traffic_light'), 'cast');
        post.position.set(lx - inset, 0, lz - inset);
        this.scene.add(post);
        if (!first) first = post;
      }
    }
    this.signals = new Signals(first);
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
      const pay = Math.round(lo + this.random() * (hi - lo));
      // Time the route you can actually drive, not the crow's flight: the
      // streets are a grid, so the trip is the Manhattan distance. The grace
      // covers the red lights on the way.
      const route = Math.abs(dx) + Math.abs(dz);
      const limit = route / CITY.missionPace + CITY.missionGrace;
      this.mission = {
        x, z, pay,
        bonus: Math.round(pay * CITY.missionBonus),
        limit,
        left: limit,
        expired: false,
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

    this.stats = { coins: 0, collected: 0, deliveries: 0, onTime: 0,
                   distance: 0 };
    this.random = makeRandom(MAP_SEED + 7);
    this.scatterCoins(this.city.streetLines, this.city.halfExtent - 14);
    this.traffic.reset(this.car.x, this.car.z);
    this.pedestrians.reset(this.car.x, this.car.z);
    this.newMission();
  }

  update(dt, controls, time) {
    const travelled = this.car.update(dt, controls, this.collider);
    this.stats.distance += travelled;

    environment.followSun(this.sun, this.car.x, this.car.z);
    this.signals.update(dt);
    this.traffic.update(dt, this.car.x, this.car.z, this.signals);
    this.pedestrians.update(dt, this.car.x, this.car.z);
    this.resolveTrafficContact();
    this.collectCoins(time);
    this.checkMission(dt);

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

  checkMission(dt) {
    if (!this.mission) return;

    this.mission.left -= dt;
    if (this.mission.left <= 0 && !this.mission.expired) {
      this.mission.expired = true;
      this.hud.toast('Süre doldu — bonus gitti', 1.8);
    }

    const dx = this.mission.x - this.car.x;
    const dz = this.mission.z - this.car.z;
    if (dx * dx + dz * dz > CITY.missionArriveRadius ** 2) return;

    const onTime = !this.mission.expired;
    const paid = this.mission.pay + (onTime ? this.mission.bonus : 0);
    this.stats.coins += paid;
    this.stats.deliveries += 1;
    if (onTime) this.stats.onTime += 1;
    audio.nitro();
    this.car.addNitro(0.5);
    this.hud.toast(onTime
      ? `Zamanında! +${paid} 🪙 (${this.mission.bonus} bonus)`
      : `Teslimat tamam! +${paid} 🪙`, 2.2);
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
      timeLeft: this.mission ? Math.max(0, this.mission.left) : null,
    };
  }

  updateCamera(dt, camera) {
    const car = this.car;
    const follow = 1 - Math.exp(-DRIVE.cameraLerp * dt);

    // Reversing swings the camera round to the front of the car so you can
    // see where you are backing into. Eased, so it arcs round instead of
    // snapping through the car.
    const wantReverse = car.speed < -1.2 ? 1 : 0;
    this.reverseBlend += (wantReverse - this.reverseBlend)
      * Math.min(1, dt * DRIVE.reverseCameraLerp);

    // Sit behind the nose, swung a little into the corner so you can see
    // where the car is going rather than where it has been.
    const swing = car.heading + car.steerAngle * DRIVE.cameraTurnLead
      + Math.PI * this.reverseBlend;
    const distance = DRIVE.cameraDistance * this.rigScale;
    const desiredX = car.x + Math.sin(swing) * distance;
    const desiredZ = car.z + Math.cos(swing) * distance;

    camera.position.x += (desiredX - camera.position.x) * follow;
    camera.position.z += (desiredZ - camera.position.z) * follow;
    camera.position.y +=
      (DRIVE.cameraHeight * this.rigScale - camera.position.y) * follow;

    // Keep the camera out of the buildings it would otherwise clip through.
    const clear = this.collider.resolve(camera.position.x, camera.position.z, 1.1);
    camera.position.x = clear.x;
    camera.position.z = clear.z;

    if (car.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * car.shake * 0.4;
      camera.position.y += (Math.random() - 0.5) * car.shake * 0.4;
    }

    const reach = DRIVE.cameraLookAhead * (1 - 1.6 * this.reverseBlend);
    const ahead = car.forward().multiplyScalar(reach);
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
    this.pedestrians.reset(this.car.x, this.car.z);
  }
}
