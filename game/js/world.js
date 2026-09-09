/**
 * The endless highway: sky, lighting, recycled road tiles and roadside props.
 *
 * The player drives toward -Z, so "ahead" is a smaller z. Nothing is ever
 * created during play -- tiles and scenery are pooled at startup and moved
 * back to the horizon once they fall behind the camera.
 */

import * as THREE from 'three';
import * as assets from './assets.js';
import { WORLD, SCENERY } from './config.js';

const TIME_OF_DAY = {
  dusk: {
    top: '#1d2b52', horizon: '#f0a35e', ground: '#6b5340',
    sun: '#ffb066', sunIntensity: 2.9,
    hemiSky: '#ffd9a8', hemiGround: '#6b5340', hemiIntensity: 1.25,
    fogNear: 60, fogFar: 280,
  },
  day: {
    top: '#2f74c0', horizon: '#cfe3f2', ground: '#7d6647',
    sun: '#fff3d8', sunIntensity: 2.6,
    hemiSky: '#bcd8f0', hemiGround: '#7d6647', hemiIntensity: 1.0,
    fogNear: 75, fogFar: 280,
  },
};

const SCENERY_KINDS = [
  { model: 'palm', weight: 3, scale: [0.9, 1.25], near: 13, far: 40 },
  { model: 'cactus', weight: 3, scale: [0.8, 1.3], near: 12, far: 46 },
  { model: 'rock', weight: 3, scale: [0.6, 1.5], near: 12, far: 58 },
  { model: 'billboard', weight: 1, scale: [0.9, 1.1], near: 16, far: 26 },
  { model: 'cone', weight: 1, scale: [1.0, 1.4], near: 8.6, far: 10.5 },
  { model: 'barrier', weight: 1, scale: [1.0, 1.2], near: 8.6, far: 10.0 },
];

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.road = assets.manifest.road;
    this.tiles = [];
    this.groundTiles = [];
    this.rails = [];
    this.lamps = [];
    this.props = [];
    this.mesas = [];
    this.preset = TIME_OF_DAY.dusk;
    this.rng = Math.random;
    this.shadowTexture = makeShadowTexture();
  }

  /** Build sky, light and every pooled object. Called once. */
  build(timeOfDay = 'dusk') {
    this.preset = TIME_OF_DAY[timeOfDay] || TIME_OF_DAY.dusk;
    this.applySky();
    this.applyLights();
    this.buildRoad();
    this.buildScenery();
  }

  applySky() {
    const preset = this.preset;
    const texture = makeSkyTexture(preset);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const environment = pmrem.fromEquirectangular(texture).texture;

    this.scene.background = texture;
    this.scene.environment = environment;      // metals need something to see
    this.scene.fog = new THREE.Fog(new THREE.Color(preset.horizon),
                                   preset.fogNear, preset.fogFar);
    pmrem.dispose();
    this.skyTexture = texture;
    this.environmentTexture = environment;
  }

  applyLights() {
    const preset = this.preset;
    const sun = new THREE.DirectionalLight(new THREE.Color(preset.sun),
                                           preset.sunIntensity);
    sun.position.set(-60, 80, -40);
    this.scene.add(sun);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(new THREE.Color(preset.hemiSky),
                                           new THREE.Color(preset.hemiGround),
                                           preset.hemiIntensity);
    this.scene.add(hemi);
  }

  buildRoad() {
    const tileLength = this.road.tileLength;
    const span = WORLD.drawDistance + WORLD.behindDistance;
    const count = Math.ceil(span / tileLength) + 2;
    this.tileSpan = count * tileLength;

    for (let i = 0; i < count; i += 1) {
      const z = WORLD.behindDistance - i * tileLength;
      const road = assets.instance('road');
      road.position.z = z;
      this.scene.add(road);
      this.tiles.push(road);

      const ground = assets.instance('ground');
      ground.position.z = z;
      this.scene.add(ground);
      this.groundTiles.push(ground);
    }

    // Guardrails run down both shoulders on their own, shorter cadence.
    const railTile = this.road.guardrailTile;
    const railCount = Math.ceil(span / railTile) + 2;
    this.railSpan = railCount * railTile;
    const railX = this.road.edgeX + this.road.shoulderWidth * 0.55;
    for (let i = 0; i < railCount; i += 1) {
      const z = WORLD.behindDistance - i * railTile;
      for (const side of [-1, 1]) {
        const rail = assets.instance('guardrail');
        rail.position.set(side * railX, 0, z);
        this.scene.add(rail);
        this.rails.push(rail);
      }
    }

    // Street lights, right-hand side only, like a real carriageway.
    const lampCount = Math.ceil(span / SCENERY.lampSpacing) + 2;
    this.lampSpan = lampCount * SCENERY.lampSpacing;
    for (let i = 0; i < lampCount; i += 1) {
      const lamp = assets.instance('lamp');
      lamp.position.set(-(this.road.edgeX + 2.6), 0,
                        WORLD.behindDistance - i * SCENERY.lampSpacing);
      lamp.rotation.y = Math.PI;      // crane the arm out over the road
      this.scene.add(lamp);
      this.lamps.push(lamp);
    }
  }

  buildScenery() {
    const span = WORLD.drawDistance + WORLD.behindDistance;
    const count = Math.ceil(span / SCENERY.spacing) * 2;
    this.propSpan = (count / 2) * SCENERY.spacing;

    for (let i = 0; i < count; i += 1) {
      const holder = new THREE.Group();
      this.scene.add(holder);
      const entry = { holder, current: null, z: 0 };
      this.props.push(entry);
      this.placeProp(entry, WORLD.behindDistance
        - Math.floor(i / 2) * SCENERY.spacing);
    }

    // A handful of distant buttes on a much longer cadence.
    const mesaSpacing = 220;
    const mesaCount = Math.ceil((span + 400) / mesaSpacing);
    this.mesaSpan = mesaCount * mesaSpacing;
    for (let i = 0; i < mesaCount; i += 1) {
      const mesa = assets.instance('mesa');
      this.scene.add(mesa);
      this.mesas.push(mesa);
      this.placeMesa(mesa, WORLD.behindDistance - i * mesaSpacing);
    }
  }

  placeProp(entry, z) {
    if (entry.current) {
      entry.holder.remove(entry.current);
      entry.current = null;
    }
    const kind = pickWeighted(SCENERY_KINDS);
    const model = assets.instance(kind.model);
    const scale = lerp(kind.scale[0], kind.scale[1], Math.random());
    model.scale.setScalar(scale);
    model.rotation.y = Math.random() * Math.PI * 2;
    entry.holder.add(model);
    entry.current = model;

    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * lerp(Math.max(kind.near, SCENERY.sideMin),
                          Math.min(kind.far, SCENERY.sideMax), Math.random());
    // Billboards face the traffic rather than pointing at the desert.
    if (kind.model === 'billboard') model.rotation.y = side < 0 ? 0.35 : -0.35;
    entry.holder.position.set(x, 0, z + (Math.random() - 0.5) * SCENERY.spacing);
    entry.z = entry.holder.position.z;
  }

  placeMesa(mesa, z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    mesa.position.set(side * lerp(120, 240, Math.random()), -2,
                      z + (Math.random() - 0.5) * 120);
    mesa.rotation.y = Math.random() * Math.PI;
    mesa.scale.setScalar(lerp(0.8, 1.8, Math.random()));
  }

  /** Recycle everything that has fallen behind the player. */
  update(playerZ) {
    const behind = playerZ + WORLD.behindDistance;
    recycle(this.tiles, behind, this.tileSpan);
    recycle(this.groundTiles, behind, this.tileSpan);
    recycle(this.rails, behind, this.railSpan);
    recycle(this.lamps, behind, this.lampSpan);
    recycle(this.mesas, behind, this.mesaSpan,
            (mesa, z) => this.placeMesa(mesa, z));

    for (const entry of this.props) {
      if (entry.holder.position.z > behind) {
        this.placeProp(entry, entry.holder.position.z - this.propSpan);
      }
    }
  }

  /** Shift the whole world back toward the origin to keep floats precise. */
  rebase(offset) {
    const shift = (object) => { object.position.z -= offset; };
    this.tiles.forEach(shift);
    this.groundTiles.forEach(shift);
    this.rails.forEach(shift);
    this.lamps.forEach(shift);
    this.mesas.forEach(shift);
    this.props.forEach((entry) => {
      entry.holder.position.z -= offset;
      entry.z = entry.holder.position.z;
    });
  }

  /** A soft dark ellipse to ground a vehicle without a real shadow pass. */
  makeShadow(width, length) {
    const geometry = new THREE.PlaneGeometry(width * 1.5, length * 1.15);
    const material = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      color: 0x000000,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.renderOrder = -1;
    return mesh;
  }
}

function recycle(items, behind, span, onRecycle) {
  for (const item of items) {
    if (item.position.z > behind) {
      const z = item.position.z - span;
      if (onRecycle) onRecycle(item, z);
      else item.position.z = z;
    }
  }
}

function pickWeighted(list) {
  let total = 0;
  for (const item of list) total += item.weight;
  let roll = Math.random() * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Vertical gradient used both as the visible sky and, through PMREM, as the
 * environment map. Without it every metallic material renders black.
 */
function makeSkyTexture(preset) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0.00, preset.top);
  gradient.addColorStop(0.42, preset.top);
  gradient.addColorStop(0.50, preset.horizon);
  gradient.addColorStop(0.56, preset.horizon);
  gradient.addColorStop(1.00, preset.ground);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export { TIME_OF_DAY };
