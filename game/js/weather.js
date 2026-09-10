/**
 * Rain: what you see, what you hear, and what it costs you.
 *
 * The rain itself is one THREE.LineSegments -- a slab of short streaks in a
 * box that follows the camera. Streaks fall, and any that drop out of the
 * box are lifted back to the top, so the same few hundred segments rain for
 * ever at the cost of a single draw call. Particles as sprites would have
 * cost one draw call each, or a texture atlas and a sorting pass; a streak of
 * rain is a line, so it is drawn as one.
 *
 * The road turns wet by editing the shared materials the loader produced:
 * darker, far smoother, so the sky and the headlights sit on it. Every piece
 * of asphalt in the city shares those materials, so the whole map goes wet on
 * two writes.
 *
 * Grip is the part the player feels. `grip` is folded into braking and into
 * the steering lock, so a wet road takes longer to stop on and asks for more
 * room in a corner -- which is what makes rain worth having rather than a
 * filter over the screen.
 */

import * as THREE from 'three';
import { WEATHER } from './config.js';

/** Names a player can pick between, plus 'auto'. */
export const WEATHERS = ['auto', 'clear', 'rain'];

export function preset(name) {
  return WEATHER.presets[name] || WEATHER.presets.clear;
}

/** 'auto' rolls the dice; anything else is taken at face value. */
export function resolve(choice) {
  if (choice && choice !== 'auto') return choice;
  return Math.random() < WEATHER.autoRainChance ? 'rain' : 'clear';
}

/**
 * The lighting preset a time of day turns into when it is raining.
 *
 * Under cloud there is barely a direction to the light: the sun comes down,
 * the sky comes up, and everything -- including the sky itself -- moves
 * toward grey. Returns the preset unchanged when it is not raining, so the
 * caller does not have to care.
 *
 * @param {object} base   one of environment.TIME_OF_DAY
 * @param {boolean} raining
 */
export function overcast(base, raining) {
  if (!raining) return base;
  const sky = WEATHER.presets.rain.sky;
  const mix = (hex) => blend(hex, sky.color, sky.amount);
  return {
    ...base,
    top: mix(base.top),
    horizon: mix(base.horizon),
    ground: mix(base.ground),
    sun: mix(base.sun),
    sunIntensity: base.sunIntensity * sky.sun,
    hemiSky: mix(base.hemiSky),
    hemiIntensity: base.hemiIntensity * sky.hemi,
    // Headlights come on in the rain whatever the hour: it is what people do,
    // and it is what makes a wet road at dusk worth looking at.
    headlights: true,
  };
}

/** Mix two '#rrggbb' colours, `amount` of `b`. */
function blend(a, b, amount) {
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x, y) => Math.round(x + (y - x) * amount)
    .toString(16).padStart(2, '0');
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

export class Weather {
  /**
   * @param {THREE.Scene} scene  searched once for the road materials named in
   *   WEATHER.wetMaterials; their dry values are remembered so it can dry out
   *   again. The materials come from the loader and are shared by every
   *   instance, so finding each one once wets the whole map.
   */
  constructor(scene) {
    this.scene = scene;
    this.name = 'clear';
    this.rainAmount = 0;          // eased, so weather arrives rather than snaps

    this.road = [];
    scene.traverse((node) => {
      if (!node.isMesh) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of list) {
        if (!material || !WEATHER.wetMaterials.includes(material.name)) continue;
        if (this.road.some((entry) => entry.material === material)) continue;
        this.road.push({
          material,
          colour: material.color.clone(),
          roughness: material.roughness,
          metalness: material.metalness,
        });
      }
    });

    this.build();
  }

  /** The streak slab. Built once and reused; only its position moves. */
  build() {
    const { count, box, streak } = WEATHER.rain;
    const positions = new Float32Array(count * 6);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      this.seed(positions, i, Math.random() * box.height);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(WEATHER.rain.color),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });
    this.drops = new THREE.LineSegments(geometry, material);
    this.drops.frustumCulled = false;   // it is always around the camera
    this.drops.visible = false;
    this.drops.renderOrder = 2;
    this.scene.add(this.drops);
    void streak;
  }

  /** Place one streak at a random spot in the box, `y` metres up. */
  seed(positions, index, y) {
    const { box, streak, fall } = WEATHER.rain;
    const x = (Math.random() - 0.5) * box.width;
    const z = (Math.random() - 0.5) * box.depth;
    const length = streak[0] + Math.random() * (streak[1] - streak[0]);
    const at = index * 6;
    positions[at] = x;
    positions[at + 1] = y;
    positions[at + 2] = z;
    positions[at + 3] = x + WEATHER.rain.slant;
    positions[at + 4] = y - length;
    positions[at + 5] = z;
    this.speeds[index] = fall[0] + Math.random() * (fall[1] - fall[0]);
  }

  /** Fog range and sky tint this weather asks for, given the time of day. */
  fogScale() {
    return 1 - (1 - preset(this.name).fogScale) * this.rainAmount;
  }

  /** 1 in the dry, less on a wet road. Braking and steering both use it. */
  get grip() {
    return 1 - (1 - preset(this.name).grip) * this.rainAmount;
  }

  get raining() {
    return this.name === 'rain';
  }

  set(name) {
    this.name = WEATHERS.includes(name) && name !== 'auto' ? name : 'clear';
  }

  /**
   * @param {number} dt
   * @param {number} x  where the rain box should be centred
   * @param {number} z
   */
  update(dt, x, z) {
    const target = this.raining ? 1 : 0;
    // Weather eases in over a few seconds rather than appearing between two
    // frames -- the grip change would be a trap if it did.
    const rate = Math.min(1, dt / WEATHER.easeSeconds);
    this.rainAmount += (target - this.rainAmount) * rate * 4;
    if (Math.abs(target - this.rainAmount) < 0.002) this.rainAmount = target;

    this.applyWet();

    const visible = this.rainAmount > 0.01;
    this.drops.visible = visible;
    if (!visible) return;
    this.drops.material.opacity = WEATHER.rain.opacity * this.rainAmount;

    const { box } = WEATHER.rain;
    this.drops.position.set(x, 0, z);
    const positions = this.drops.geometry.attributes.position.array;
    const drop = dt;
    for (let i = 0; i < this.speeds.length; i += 1) {
      const at = i * 6;
      const fall = this.speeds[i] * drop;
      positions[at + 1] -= fall;
      positions[at + 4] -= fall;
      if (positions[at + 4] > 0) continue;
      this.seed(positions, i, box.height);
    }
    this.drops.geometry.attributes.position.needsUpdate = true;
  }

  /** Blend the road materials between their dry and wet values. */
  applyWet() {
    const wet = preset('rain');
    for (const entry of this.road) {
      const t = this.rainAmount;
      entry.material.color.copy(entry.colour).multiplyScalar(
        1 - (1 - wet.roadDarken) * t);
      entry.material.roughness =
        entry.roughness + (wet.roadRoughness - entry.roughness) * t;
      entry.material.metalness =
        entry.metalness + (wet.roadMetalness - entry.metalness) * t;
    }
  }

  /** Put the road back as it was. Called when a session is torn down. */
  dispose() {
    this.rainAmount = 0;
    this.applyWet();
    if (this.drops) {
      this.scene.remove(this.drops);
      this.drops.geometry.dispose();
      this.drops.material.dispose();
    }
  }
}
