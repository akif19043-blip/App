/**
 * The endless highway used by the traffic-racer mode: recycled road tiles and
 * roadside props.
 *
 * The player drives toward -Z, so "ahead" is a smaller z. Nothing is ever
 * created during play -- tiles and scenery are pooled at startup and moved
 * back to the horizon once they fall behind the camera.
 */

import * as THREE from 'three';
import * as assets from './assets.js';
import * as environment from './environment.js';
import { SCENERY, SHADOWS, WORLD } from './config.js';

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
    this.preset = environment.preset('dusk');
  }

  /** Build sky, light and every pooled object. Called once. */
  build(timeOfDay = 'dusk') {
    this.preset = environment.preset(timeOfDay);
    environment.applySky(this.scene, this.renderer, this.preset);
    this.sun = environment.applyLights(this.scene, this.preset, SHADOWS).sun;
    this.buildRoad();
    this.buildScenery();
  }

  buildRoad() {
    const tileLength = this.road.tileLength;
    const span = WORLD.drawDistance + WORLD.behindDistance;
    const count = Math.ceil(span / tileLength) + 2;
    this.tileSpan = count * tileLength;

    for (let i = 0; i < count; i += 1) {
      const z = WORLD.behindDistance - i * tileLength;
      const road = environment.shadowRole(assets.instance('road'), 'receive');
      road.position.z = z;
      this.scene.add(road);
      this.tiles.push(road);

      const ground = environment.shadowRole(
        assets.instance('ground'), 'receive');
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
        const rail = environment.shadowRole(
          assets.instance('guardrail'), 'cast');
        rail.position.set(side * railX, 0, z);
        this.scene.add(rail);
        this.rails.push(rail);
      }
    }

    // Street lights, right-hand side only, like a real carriageway.
    const lampCount = Math.ceil(span / SCENERY.lampSpacing) + 2;
    this.lampSpan = lampCount * SCENERY.lampSpacing;
    for (let i = 0; i < lampCount; i += 1) {
      const lamp = environment.shadowRole(assets.instance('lamp'), 'cast');
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
    const model = environment.shadowRole(assets.instance(kind.model), 'cast');
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
  update(playerZ, playerX = 0) {
    environment.followSun(this.sun, playerX, playerZ);
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

  makeShadow(width, length) {
    return environment.makeShadow(width, length);
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
