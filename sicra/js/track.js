/**
 * The rooftops: buildings generated ahead of the runner and recycled behind,
 * obstacle rows that are always solvable, coins laid out to hint at the
 * right move, power-ups, décor buildings on the street side, and the
 * collision checks against all of it.
 *
 * Everything is placed from one seeded Rng so a run is reproducible.
 */

import * as THREE from 'three';
import { LANES, LANE_WIDTH, ROOF, OBSTACLES, ROWS, COINS, POWERUPS, SPEED, COLORS } from './config.js';

const LANE_W = LANE_WIDTH;
const LANE_DIR = Math.sign(LANES[1] - LANES[0]);   // which way x grows with lane index
const MAX_COINS = 420;

/* ----------------------------------------------------------- geometries */

function boxUv(w, h, d, unit = 3) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const scales = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f += 1) {
    const [su, sv] = scales[f];
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su / unit, uv.getY(i) * sv / unit);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// One pastel palette for everything on the roof, so obstacles read as a set.
const M = {
  brick: new THREE.MeshStandardMaterial({ color: 0xe0866a, roughness: 1 }),
  brickDark: new THREE.MeshStandardMaterial({ color: 0xc46a52, roughness: 1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.7, metalness: 0.2 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x8794a3, roughness: 0.8, metalness: 0.2 }),
  rust: new THREE.MeshStandardMaterial({ color: 0xc98f66, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xd9a876, roughness: 1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xaee3ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.6 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xe2dbd0, roughness: 1 }),
  parapet: new THREE.MeshStandardMaterial({ color: 0xf4eee4, roughness: 1 }),
  poster: new THREE.MeshStandardMaterial({ color: 0xff8f7a, roughness: 1 }),
  posterB: new THREE.MeshStandardMaterial({ color: 0x6fc8ff, roughness: 1 }),
  cloth: [0xffffff, 0xf8c3d2, 0xa8dcf7, 0xffe59a, 0xbeeab4].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide })),
  rope: new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 1 }),
  coin: new THREE.MeshStandardMaterial({ color: COLORS.coin, roughness: 0.25, metalness: 0.6, emissive: COLORS.coin, emissiveIntensity: 0.55 }),
  magnet: new THREE.MeshStandardMaterial({ color: COLORS.magnet, roughness: 0.4, emissive: COLORS.magnet, emissiveIntensity: 0.4 }),
  shield: new THREE.MeshStandardMaterial({ color: COLORS.shield, roughness: 0.3, metalness: 0.3, emissive: COLORS.shield, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }),
  wings: new THREE.MeshStandardMaterial({ color: COLORS.wings, roughness: 0.5, emissive: COLORS.wings, emissiveIntensity: 0.45, side: THREE.DoubleSide }),
};

const G = {
  unit: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cone: new THREE.CylinderGeometry(0.02, 0.5, 1, 12),
  dish: new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6),
  coin: new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16),
  torus: new THREE.TorusGeometry(0.42, 0.14, 10, 16, Math.PI),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  pyramid: new THREE.ConeGeometry(0.9, 0.55, 4),
};

const mesh = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/* ------------------------------------------------------------ obstacles */

const BUILD = {
  chimney(g) {
    g.add(mesh(G.unit, M.brick, 0, 0.9, 0, 0.9, 1.8, 0.9));
    g.add(mesh(G.unit, M.brickDark, 0, 1.85, 0, 1.05, 0.14, 1.05));
    g.add(mesh(G.cyl, M.metalDark, -0.2, 2.0, 0, 0.3, 0.3, 0.3));
    g.add(mesh(G.cyl, M.metalDark, 0.2, 2.0, 0, 0.3, 0.3, 0.3));
  },
  tank(g) {
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      g.add(mesh(G.unit, M.rust, x, 0.5, z, 0.1, 1.0, 0.1));
    }
    g.add(mesh(G.cyl, M.wood, 0, 1.7, 0, 1.6, 1.4, 1.6));
    g.add(mesh(G.cone, M.metalDark, 0, 2.55, 0, 1.8, 0.35, 1.8));
    g.add(mesh(G.unit, M.metalDark, 0, 1.4, 0, 1.7, 0.06, 1.7));
    g.add(mesh(G.unit, M.metalDark, 0, 2.0, 0, 1.7, 0.06, 1.7));
  },
  dish(g) {
    g.add(mesh(G.unit, M.metalDark, 0, 0.5, 0, 0.12, 1.0, 0.12));
    g.add(mesh(G.unit, M.metalDark, 0, 0.05, 0, 0.7, 0.1, 0.7));
    const d = mesh(G.dish, M.white, 0, 1.15, -0.2, 1, 1, 1);
    d.rotation.x = -Math.PI / 2 + 0.5;
    g.add(d);
    g.add(mesh(G.unit, M.metalDark, 0, 1.2, 0.3, 0.05, 0.05, 0.6));
  },
  ac(g) {
    g.add(mesh(G.unit, M.metal, 0, 0.35, 0, 1.3, 0.7, 0.8));
    g.add(mesh(G.cyl, M.metalDark, 0, 0.36, 0.41, 0.5, 0.02, 0.5).rotateX(Math.PI / 2));
    g.add(mesh(G.unit, M.metalDark, 0, 0.72, 0, 1.2, 0.04, 0.7));
  },
  vent(g) {
    g.add(mesh(G.cyl, M.metal, 0, 0.3, 0, 0.5, 0.6, 0.5));
    const top = mesh(G.cyl, M.metalDark, 0, 0.7, 0, 0.8, 0.3, 0.8);
    top.userData.spin = true;
    g.add(top);
  },
  skylight(g) {
    g.add(mesh(G.unit, M.concrete, 0, 0.12, 0, 1.6, 0.24, 1.6));
    const glass = mesh(G.pyramid, M.glass, 0, 0.5, 0, 1.2, 1, 1.2);
    glass.rotation.y = Math.PI / 4;
    g.add(glass);
  },
  wall(g) {
    // billboard: two posts, a panel with a poster, spans two lanes
    const w = LANE_W * 2 - 0.3;
    g.add(mesh(G.unit, M.metalDark, -w / 2 + 0.15, 1.3, 0, 0.14, 2.6, 0.14));
    g.add(mesh(G.unit, M.metalDark, w / 2 - 0.15, 1.3, 0, 0.14, 2.6, 0.14));
    g.add(mesh(G.unit, M.white, 0, 1.75, 0, w, 1.7, 0.12));
    g.add(mesh(G.unit, M.poster, -w * 0.18, 1.75, 0.07, w * 0.5, 1.4, 0.02));
    g.add(mesh(G.unit, M.posterB, w * 0.25, 1.75, 0.07, w * 0.3, 1.0, 0.02));
  },
  line(g) {
    // laundry: two poles outside the lanes, a rope, clothes hanging to 1.05
    const half = ROOF.halfWidth - 0.6;
    g.add(mesh(G.unit, M.metalDark, -half, 0.95, 0, 0.1, 1.9, 0.1));
    g.add(mesh(G.unit, M.metalDark, half, 0.95, 0, 0.1, 1.9, 0.1));
    g.add(mesh(G.unit, M.rope, 0, 1.5, 0, half * 2, 0.03, 0.03));
    for (let i = 0; i < 6; i += 1) {
      const x = -half + 0.7 + i * (half * 2 - 1.4) / 5;
      const cloth = mesh(G.unit, M.cloth[i % M.cloth.length], x, 1.28, 0, 0.6, 0.44, 0.03);
      cloth.userData.sway = i;
      g.add(cloth);
    }
  },
};

/* ------------------------------------------------------------ power-ups */

const BUILD_POWER = {
  magnet(g) {
    const u = mesh(G.torus, M.magnet, 0, 0, 0);
    u.rotation.z = Math.PI;
    g.add(u);
    g.add(mesh(G.unit, M.white, -0.42, 0.22, 0, 0.28, 0.22, 0.28));
    g.add(mesh(G.unit, M.white, 0.42, 0.22, 0, 0.28, 0.22, 0.28));
  },
  shield(g) {
    g.add(mesh(G.ico, M.shield, 0, 0, 0, 1.1, 1.1, 1.1));
    g.add(mesh(G.ico, M.white, 0, 0, 0, 0.5, 0.5, 0.5));
  },
  wings(g) {
    for (const s of [-1, 1]) {
      const w = mesh(G.unit, M.wings, s * 0.45, 0, 0, 0.8, 0.35, 0.06);
      w.rotation.z = s * 0.3;
      g.add(w);
    }
    g.add(mesh(G.ico, M.white, 0, 0, 0, 0.3, 0.3, 0.3));
  },
};

/* ----------------------------------------------------------------- track */

export class Track {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.segments = [];         // { z0, z1, gapAfter, meshes[], obstacles[] }
    this.obstacles = [];        // flat list, sorted by z, for collision
    this.powerups = [];
    this.pools = {};
    this.powerPools = {};

    // coins: one instanced mesh
    this.coinMesh = new THREE.InstancedMesh(G.coin, M.coin, MAX_COINS);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.castShadow = false;
    this.coinMesh.frustumCulled = false;
    this.group.add(this.coinMesh);
    this.coins = [];            // { x, y, z, alive, pull }
    this.dummy = new THREE.Object3D();
    this.coinSpin = 0;

    this.reset(rng);
  }

  reset(rng) {
    if (rng) this.rng = rng;
    for (const seg of this.segments) this.releaseSegment(seg);
    this.segments.length = 0;
    this.obstacles.length = 0;
    for (const p of this.powerups) this.releasePower(p);
    this.powerups.length = 0;
    this.coins.length = 0;
    this.cursor = -12;          // first roof starts behind the player
    this.lastRowZ = -20;
    this.lastFree = [0, 1, 2];
    this.nextPowerAt = this.rng.range(POWERUPS.spawnEvery[0] * 0.5, POWERUPS.spawnEvery[1] * 0.7);
    this.speedHint = SPEED.start;
    this.clearUntil = -Infinity;
    // the first building is long and empty: room to get going
    this.pushBuilding(this.cursor, 40, false, true);
    this.ensure(ROOF.ahead);
    this.writeCoins();
  }

  /** Kept for the quality watchdog; the roof has no scalable décor now. */
  setDecorScale() {}

  /* ---------------------------------------------------------- queries */

  /** Is there roof under this z? */
  roofAt(z) {
    for (const seg of this.segments) {
      if (z >= seg.z0 && z <= seg.z1) return true;
    }
    return false;
  }

  /** Remove every obstacle within `dist` metres ahead of z (revive). */
  clearAhead(z, dist) {
    this.clearUntil = z + dist;
    for (const o of this.obstacles) {
      if (o.z > z - 1 && o.z < z + dist && o.alive) this.smash(o, false);
    }
  }

  /* ------------------------------------------------------- generation */

  difficulty(z) {
    return Math.min(1, Math.max(0, z / ROWS.densityDistance));
  }

  ensure(ahead, speed = this.speedHint) {
    this.speedHint = speed;
    while (this.cursor < ahead) {
      const d = this.difficulty(this.cursor);
      const len = this.rng.range(ROOF.minLength, ROOF.maxLength) * (1 + speed / SPEED.max * 0.4);
      const gap = this.rng.chance(ROOF.gapChance * (0.6 + d * 0.6));
      this.pushBuilding(this.cursor, len, gap, false);
    }
  }

  pushBuilding(z0, length, gapAfter, empty) {
    const z1 = z0 + length;
    const seg = { z0, z1, gapAfter: false, meshes: [], obstacles: [] };
    this.buildStructure(seg);
    const prev = this.segments[this.segments.length - 1];
    const afterGap = prev ? prev.gapAfter : false;
    if (!empty) this.populate(seg, afterGap, gapAfter);
    if (gapAfter) {
      const speedK = 0.6 + 0.4 * Math.min(1, this.speedHint / SPEED.max);
      const g = this.rng.range(ROOF.gapMin, ROOF.gapMax * speedK + ROOF.gapMin * (1 - speedK));
      seg.gapAfter = true;
      seg.gap = g;
      this.coinsOverGap(z1, g);
      this.cursor = z1 + g;
    } else {
      this.cursor = z1;
    }
    this.segments.push(seg);
  }

  buildStructure(seg) {
    const len = seg.z1 - seg.z0;
    const depth = this.rng.range(ROOF.depthMin, ROOF.depthMax);
    const facade = this.world.facades[this.rng.int(0, this.world.facades.length - 1)];
    const geo = boxUv(ROOF.halfWidth * 2, depth, len, 3.2);
    const mats = [facade, facade, this.world.roofMaterial, this.world.darkMaterial, facade, facade];
    const body = new THREE.Mesh(geo, mats);
    body.position.set(0, -depth / 2, seg.z0 + len / 2);
    body.receiveShadow = true;
    body.userData.dispose = true;
    this.group.add(body);
    seg.meshes.push(body);

    // parapets along the long sides and at both ends
    const px = ROOF.halfWidth - 0.2;
    for (const s of [-1, 1]) {
      const p = mesh(G.unit, M.parapet, s * px, ROOF.parapet / 2, seg.z0 + len / 2, 0.4, ROOF.parapet, len);
      p.castShadow = false;
      this.group.add(p);
      seg.meshes.push(p);
    }
    for (const z of [seg.z0 + 0.2, seg.z1 - 0.2]) {
      const p = mesh(G.unit, M.parapet, 0, ROOF.parapet / 2, z, ROOF.halfWidth * 2, ROOF.parapet, 0.4);
      p.castShadow = false;
      this.group.add(p);
      seg.meshes.push(p);
    }
    // a roof access hut on the outer strip, never in a lane
    if (len > 18 && this.rng.chance(0.7)) {
      const side = this.rng.pick([-1, 1]);
      const hz = this.rng.range(seg.z0 + 3, seg.z1 - 3);
      const hut = mesh(G.unit, M.concrete, side * (ROOF.halfWidth + 0.3), 0.9, hz, 1.2, 1.8, 2.0);
      const door = mesh(G.unit, M.posterB, side * (ROOF.halfWidth - 0.32), 0.7, hz, 0.04, 1.3, 0.7);
      this.group.add(hut, door);
      seg.meshes.push(hut, door);
    }
  }

  /** Lay obstacle rows and coins on a roof. */
  populate(seg, afterGap, gapAfter) {
    const start = seg.z0 + (afterGap ? ROOF.landingMargin : 2.5);
    const end = seg.z1 - (gapAfter ? ROOF.edgeMargin : 1.5);
    const d = this.difficulty(seg.z0);
    const spacing = ROWS.minSpacing + ROWS.speedFactor * this.speedHint;
    const density = ROWS.densityStart + (ROWS.densityMax - ROWS.densityStart) * d;
    let z = Math.max(start, this.lastRowZ + spacing);
    let placedAny = false;
    while (z < end) {
      if (this.rng.chance(density * spacing / 10) || !placedAny && z + spacing > end && this.rng.chance(0.5)) {
        const extra = this.placeRow(seg, z, d);
        this.lastRowZ = z;
        placedAny = true;
        z += spacing + extra;
      } else {
        if (this.rng.chance(0.35)) this.coinLine(this.rng.pick(this.lastFree), z, this.rng.int(4, 7));
        z += spacing * 0.7;
      }
      if (z > this.nextPowerAt) {
        this.placePower(z - spacing * 0.35);
        this.nextPowerAt = z + this.rng.range(POWERUPS.spawnEvery[0], POWERUPS.spawnEvery[1]);
      }
    }
    if (!placedAny && this.rng.chance(0.5)) {
      this.coinLine(this.rng.int(0, 2), seg.z0 + 4, Math.min(8, Math.floor((end - start) / COINS.spacing)));
    }
  }

  /** One obstacle row at z. Returns extra spacing needed after it. */
  placeRow(seg, z, d) {
    const kinds = { single: 5, low: 5, line: 2 + d * 3, double: 1 + d * 5, mixed: d * 4 };
    const kind = this.rng.weighted(Object.fromEntries(Object.entries(kinds).map(([k, w]) => [k, { weight: w }])));
    let free = [0, 1, 2];
    let extra = 0;
    const lanes = [0, 1, 2];
    const blocking = Object.keys(OBSTACLES).filter((k) => !OBSTACLES[k].low && !OBSTACLES[k].high && OBSTACLES[k].lanes === 1);
    const lows = Object.keys(OBSTACLES).filter((k) => OBSTACLES[k].low);
    const pickBlock = () => this.rng.weighted(Object.fromEntries(blocking.map((k) => [k, OBSTACLES[k]])));
    const pickLow = () => this.rng.weighted(Object.fromEntries(lows.map((k) => [k, OBSTACLES[k]])));

    switch (kind) {
      case 'single': {
        const lane = this.rng.int(0, 2);
        this.placeObstacle(seg, pickBlock(), lane, z);
        free = lanes.filter((l) => l !== lane);
        break;
      }
      case 'low': {
        const n = this.rng.int(1, 3);
        const chosen = [...lanes].sort(() => this.rng.next() - 0.5).slice(0, n);
        for (const lane of chosen) {
          const type = pickLow();
          this.placeObstacle(seg, type, lane, z);
          this.coinArc(lane, z, OBSTACLES[type].top);
        }
        free = lanes;      // all passable with a jump
        break;
      }
      case 'line':
        this.placeObstacle(seg, 'line', 1, z);
        this.coinLine(this.rng.int(0, 2), z - 2.5, 5, 0.45);
        free = lanes;
        break;
      case 'double': {
        const freeLane = this.pickFreeLane();
        if (this.rng.chance(0.5)) {
          // a wall over the two others
          const wallLane = freeLane === 0 ? 1.5 : freeLane === 2 ? 0.5 : (this.rng.chance(0.5) ? 0.5 : 1.5);
          if (freeLane === 1) {
            // wall cannot straddle the middle; use two singles instead
            this.placeObstacle(seg, pickBlock(), 0, z);
            this.placeObstacle(seg, pickBlock(), 2, z);
          } else {
            this.placeObstacle(seg, 'wall', wallLane, z);
          }
        } else {
          for (const lane of lanes) if (lane !== freeLane) this.placeObstacle(seg, pickBlock(), lane, z);
        }
        this.coinLine(freeLane, z - 3, 6);
        free = [freeLane];
        extra = this.switchPenalty(free);
        break;
      }
      case 'mixed': {
        const freeLane = this.pickFreeLane();
        const lowLane = this.rng.pick(lanes.filter((l) => l !== freeLane));
        const blockLane = lanes.find((l) => l !== freeLane && l !== lowLane);
        this.placeObstacle(seg, pickBlock(), blockLane, z);
        const type = pickLow();
        this.placeObstacle(seg, type, lowLane, z);
        this.coinArc(lowLane, z, OBSTACLES[type].top);
        free = [freeLane, lowLane];
        extra = this.switchPenalty(free);
        break;
      }
      default:
        break;
    }
    this.lastFree = free;
    return extra;
  }

  pickFreeLane() {
    // prefer a lane reachable with one switch from the last free set
    const options = [0, 1, 2].filter((l) => this.lastFree.some((f) => Math.abs(f - l) <= 1));
    return this.rng.pick(options.length ? options : [0, 1, 2]);
  }

  switchPenalty(free) {
    const need = Math.min(...free.map((l) => Math.min(...this.lastFree.map((f) => Math.abs(f - l)))));
    return need >= 2 ? 4 : 0;
  }

  placeObstacle(seg, type, lane, z) {
    const spec = OBSTACLES[type];
    const x = Number.isInteger(lane) ? LANES[lane] : LANES[0] + lane * LANE_W * LANE_DIR;
    const g = this.acquire(type);
    g.position.set(spec.lanes === 3 ? 0 : x, 0, z);
    g.visible = true;
    const halfW = spec.lanes === 3 ? ROOF.halfWidth : (LANE_W * spec.lanes) / 2 - 0.25;
    const halfD = type === 'line' ? 0.15 : type === 'wall' ? 0.2 : 0.5;
    const o = { type, x: g.position.x, z, halfW, halfD, y0: spec.bottom, y1: spec.top, low: !!spec.low, high: !!spec.high, group: g, alive: true, passed: false };
    g.userData.obstacle = o;
    seg.obstacles.push(o);
    this.obstacles.push(o);
  }

  acquire(type) {
    const pool = this.pools[type] || (this.pools[type] = []);
    let g = pool.pop();
    if (!g) {
      g = new THREE.Group();
      BUILD[type](g);
      this.group.add(g);
    }
    g.visible = true;
    return g;
  }

  release(o) {
    o.group.visible = false;
    o.group.position.set(0, -200, 0);
    this.pools[o.type].push(o.group);
  }

  placePower(z) {
    const kinds = { magnet: { weight: 4 }, shield: { weight: 3 }, wings: { weight: 2 } };
    const kind = this.rng.weighted(kinds);
    const lane = this.rng.pick(this.lastFree);
    const pool = this.powerPools[kind] || (this.powerPools[kind] = []);
    let g = pool.pop();
    if (!g) {
      g = new THREE.Group();
      BUILD_POWER[kind](g);
      this.group.add(g);
    }
    g.visible = true;
    g.position.set(LANES[lane], 1.2, z);
    this.powerups.push({ kind, x: LANES[lane], y: 1.2, z, group: g, alive: true });
  }

  releasePower(p) {
    p.group.visible = false;
    p.group.position.set(0, -200, 0);
    (this.powerPools[p.kind] || (this.powerPools[p.kind] = [])).push(p.group);
  }

  /* ---------------------------------------------------------- coins */

  addCoin(x, y, z) {
    if (this.coins.length >= MAX_COINS) return;
    this.coins.push({ x, y, z, alive: true, pull: false });
  }

  coinLine(lane, z, n, y = 0.9) {
    for (let i = 0; i < n; i += 1) this.addCoin(LANES[lane], y, z + i * COINS.spacing);
  }

  /** Coins in a jump arc over a low obstacle at z. */
  coinArc(lane, z, top) {
    const n = 7;
    const span = 5.4;
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1) - 0.5;
      const y = (top + 0.9) * (1 - (t * 2) ** 2) + 0.7;
      this.addCoin(LANES[lane], y, z + t * span);
    }
  }

  coinsOverGap(z1, gap) {
    if (!this.rng.chance(0.6)) return;
    const lane = this.rng.int(0, 2);
    const n = 7;
    const span = gap + 5;
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1) - 0.5;
      const y = 1.5 * (1 - (t * 2) ** 2) + 0.8;
      this.addCoin(LANES[lane], y, z1 + gap / 2 + t * span);
    }
  }

  writeCoins() {
    let i = 0;
    for (const c of this.coins) {
      if (!c.alive) continue;
      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(Math.PI / 2, 0, this.coinSpin + c.z * 0.3);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.coinMesh.setMatrixAt(i, this.dummy.matrix);
      i += 1;
    }
    this.coinMesh.count = i;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  /* --------------------------------------------------------- per frame */

  /**
   * @returns {{coins:number, hit:object|null, power:object|null, near:object|null, smashed:object[]}}
   */
  update(dt, player, speed, effects) {
    const pz = player.z;
    this.ensure(pz + ROOF.ahead, speed);
    this.recycle(pz - ROOF.behind);

    const result = { coins: 0, hit: null, power: null, near: null, smashed: [] };
    const box = player.box();
    const shield = player.power.shield > 0;
    const magnet = player.power.magnet > 0 || player.flying;

    // obstacles
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      if (o.z < pz - 3) continue;
      if (o.z > pz + 3) break;
      const ox0 = o.x - o.halfW;
      const ox1 = o.x + o.halfW;
      const oz0 = o.z - o.halfD;
      const oz1 = o.z + o.halfD;
      const overlapXZ = box.x1 > ox0 && box.x0 < ox1 && box.z1 > oz0 && box.z0 < oz1;
      if (overlapXZ && box.y1 > o.y0 + 0.02 && box.y0 < o.y1 - 0.02) {
        if (shield || player.flying) {
          this.smash(o, true, effects);
          result.smashed.push(o);
        } else {
          result.hit = o;
          return result;
        }
      } else if (!o.passed && o.z < pz) {
        o.passed = true;
        // near miss: barely over, barely under, or still half in the lane
        const leaving = player.switchFrom >= 0 && !o.low && !o.high
          && Math.abs(player.switchFromX - o.x) < o.halfW + 0.3 && o.z - player.switchZ < 3.2;
        const yOver = o.low && box.x1 > ox0 && box.x0 < ox1 && box.y0 >= o.y1 && box.y0 < o.y1 + 0.35;
        const yUnder = o.high && box.y1 <= o.y0 && box.y1 > o.y0 - 0.3;
        if (leaving || yOver || yUnder) result.near = o;
      }
    }

    // power-ups
    for (const p of this.powerups) {
      if (!p.alive) continue;
      const dx = p.x - player.x;
      const dy = p.y - (player.y + 0.9);
      const dz = p.z - pz;
      if (dx * dx + dz * dz < 1.0 && Math.abs(dy) < 1.6) {
        p.alive = false;
        this.releasePower(p);
        result.power = p;
      } else {
        p.group.rotation.y += dt * 2.2;
        p.group.position.y = p.y + Math.sin(performance.now() * 0.004 + p.z) * 0.12;
      }
    }

    // coins
    this.coinSpin += dt * 3;
    const r2 = COINS.radius * COINS.radius;
    const m2 = COINS.magnetRadius * COINS.magnetRadius;
    const cy = player.y + 0.9;
    for (const c of this.coins) {
      if (!c.alive) continue;
      const dz = c.z - pz;
      if (dz < -2 || dz > 10) continue;
      let dx = c.x - player.x;
      let dy = c.y - cy;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2 || (c.pull && d2 < 1.2)) {
        c.alive = false;
        result.coins += 1;
        effects?.coin(c.x, c.y, c.z);
        continue;
      }
      if (magnet && d2 < m2) c.pull = true;
      if (c.pull) {
        const d = Math.sqrt(d2) || 1;
        const k = Math.min(1, (COINS.magnetSpeed * dt) / d);
        c.x -= dx * k;
        c.y -= dy * k;
        c.z -= dz * k;
      }
    }
    this.writeCoins();

    // small animations on obstacles near the camera
    for (const o of this.obstacles) {
      if (!o.alive || o.z < pz - 10 || o.z > pz + 60) continue;
      if (o.type === 'vent' || o.type === 'line') {
        for (const child of o.group.children) {
          if (child.userData.spin) child.rotation.y += dt * 4;
          if (child.userData.sway !== undefined) child.rotation.x = Math.sin(performance.now() * 0.003 + child.userData.sway) * 0.25;
        }
      }
    }
    return result;
  }

  smash(o, loud, effects) {
    o.alive = false;
    if (loud && effects) effects.smash(o.x, 1.0, o.z);
    this.release(o);
  }

  recycle(behind) {
    while (this.segments.length && this.segments[0].z1 + (this.segments[0].gap || 0) < behind) {
      const seg = this.segments.shift();
      this.releaseSegment(seg);
    }
    // obstacle list: drop what belongs to gone segments
    if (this.obstacles.length && this.obstacles[0].z < behind - 5) {
      this.obstacles = this.obstacles.filter((o) => o.z >= behind - 5);
    }
    if (this.powerups.length) {
      for (const p of this.powerups) if (p.alive && p.z < behind) { p.alive = false; this.releasePower(p); }
      this.powerups = this.powerups.filter((p) => p.alive);
    }
    if (this.coins.length > 200) {
      this.coins = this.coins.filter((c) => c.alive && c.z >= behind);
    }
  }

  releaseSegment(seg) {
    for (const m of seg.meshes) {
      this.group.remove(m);
      if (m.userData.dispose) m.geometry.dispose();
    }
    for (const o of seg.obstacles) if (o.alive) { o.alive = false; this.release(o); }
    seg.meshes.length = 0;
    seg.obstacles.length = 0;
  }
}
