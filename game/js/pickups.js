/**
 * Coins and nitro canisters.
 *
 * Coins arrive in short runs down one lane so they read as a line to follow,
 * which is what makes weaving between traffic for them feel deliberate rather
 * than lucky. Everything is pooled; nothing allocates during a run.
 */

import * as assets from './assets.js';
import * as audio from './audio.js';
import { PICKUPS } from './config.js';

const COIN_POOL = 40;
const NITRO_POOL = 6;

export class Pickups {
  constructor(scene, laneCenters) {
    this.scene = scene;
    this.lanes = laneCenters;
    this.coins = makePool(scene, 'coin', COIN_POOL, PICKUPS.coinHeight);
    this.nitros = makePool(scene, 'nitro', NITRO_POOL, PICKUPS.nitroHeight);
    this.nextSpawnZ = 0;
  }

  reset(playerZ) {
    [...this.coins, ...this.nitros].forEach(release);
    this.nextSpawnZ = playerZ;      // first run is laid down at once
  }

  spawnRun(playerZ) {
    const lane = Math.floor(Math.random() * this.lanes.length);
    const x = this.lanes[lane];
    const startZ = playerZ - PICKUPS.spawnAhead - Math.random() * 50;

    if (Math.random() < PICKUPS.coinChancePerSpawn) {
      const [lo, hi] = PICKUPS.coinRunLength;
      const count = lo + Math.floor(Math.random() * (hi - lo + 1));
      let placed = 0;
      for (const coin of this.coins) {
        if (placed >= count) break;
        if (coin.inUse) continue;
        coin.inUse = true;
        coin.object.visible = true;
        coin.object.position.set(x, PICKUPS.coinHeight,
                                 startZ - placed * PICKUPS.coinSpacing);
        placed += 1;
      }
    }

    if (Math.random() < PICKUPS.nitroChancePerSpawn) {
      const free = this.nitros.find((item) => !item.inUse);
      if (free) {
        const otherLane = Math.floor(Math.random() * this.lanes.length);
        free.inUse = true;
        free.object.visible = true;
        free.object.position.set(this.lanes[otherLane], PICKUPS.nitroHeight,
                                 startZ - 90 - Math.random() * 70);
      }
    }
  }

  /**
   * @returns {{coins:number, nitro:number}} collected this frame
   */
  update(dt, playerZ, playerX, time) {
    if (playerZ < this.nextSpawnZ) {
      this.spawnRun(playerZ);
      this.nextSpawnZ -= PICKUPS.spawnIntervalMetres;
    }

    const collected = { coins: 0, nitro: 0 };
    const behind = playerZ + 30;

    for (const coin of this.coins) {
      if (!coin.inUse) continue;
      coin.object.rotation.y = time * 3.2;
      coin.object.position.y = PICKUPS.coinHeight
        + Math.sin(time * 3 + coin.object.position.z * 0.1) * 0.08;
      if (this.reached(coin, playerZ, playerX)) {
        release(coin);
        collected.coins += 1;
      } else if (coin.object.position.z > behind) {
        release(coin);
      }
    }

    for (const item of this.nitros) {
      if (!item.inUse) continue;
      item.object.rotation.y = time * 2.0;
      if (this.reached(item, playerZ, playerX)) {
        release(item);
        collected.nitro += 1;
      } else if (item.object.position.z > behind) {
        release(item);
      }
    }

    if (collected.coins) audio.coin();
    if (collected.nitro) audio.nitro();
    return collected;
  }

  reached(item, playerZ, playerX) {
    const dz = item.object.position.z - playerZ;
    if (dz > PICKUPS.radius || dz < -PICKUPS.radius) return false;
    return Math.abs(item.object.position.x - playerX) < PICKUPS.radius * 0.75;
  }

  rebase(offset) {
    [...this.coins, ...this.nitros].forEach((item) => {
      item.object.position.z -= offset;
    });
    this.nextSpawnZ -= offset;
  }
}

function makePool(scene, model, count, height) {
  const pool = [];
  for (let i = 0; i < count; i += 1) {
    const object = assets.instance(model);
    object.position.y = height;
    object.visible = false;
    scene.add(object);
    pool.push({ object, inUse: false });
  }
  return pool;
}

function release(item) {
  item.inUse = false;
  item.object.visible = false;
}
