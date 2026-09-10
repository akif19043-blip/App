/**
 * Pedestrians walking the pavements.
 *
 * Each one loops the perimeter of a city block, inset far enough that they
 * stand on the pavement -- which the car cannot reach, so they need no
 * collision handling and can never be run over or block traffic. They exist to
 * make the city look inhabited, and they cost four draw calls each.
 *
 * The legs are swung directly (the model leaves them as named child objects
 * with their pivots at the hip), so there is no animation system involved.
 */

import * as THREE from 'three';
import * as assets from './assets.js';
import { CITY } from './config.js';

const SHIRT_COLORS = [
  '#3f7fd0', '#c9452f', '#e0b23c', '#4f9a5c', '#8a5cc0',
  '#d0762f', '#3aa8a0', '#c4c9d0', '#7a4a3a', '#2f4858',
];

export class Pedestrians {
  constructor(scene, city, random) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.walkInset = city.block / 2 - 1.7;      // on the pavement, off the kerb
    this.side = this.walkInset * 2;
    this.perimeter = this.side * 4;
    this.people = [];

    for (let i = 0; i < CITY.pedestrians; i += 1) {
      const root = assets.instance('pedestrian');
      assets.tint(root, 'Shirt', SHIRT_COLORS[i % SHIRT_COLORS.length]);
      scene.add(root);
      this.people.push({
        root,
        legs: [root.getObjectByName('Leg_L'), root.getObjectByName('Leg_R')],
        block: { x: 0, z: 0 },
        t: 0, dir: 1, speed: 1.3, phase: 0,
      });
    }
  }

  /**
   * Point and heading `t` metres around a block's pavement loop.
   * The loop is a square, so each side is a straight run of `side` metres.
   */
  pointAt(block, t) {
    const side = this.side;
    const inset = this.walkInset;
    const wrapped = ((t % this.perimeter) + this.perimeter) % this.perimeter;
    const leg = Math.floor(wrapped / side);
    const along = wrapped - leg * side;

    switch (leg) {
      case 0: return { x: block.x - inset + along, z: block.z - inset,
                       heading: -Math.PI / 2 };
      case 1: return { x: block.x + inset, z: block.z - inset + along,
                       heading: Math.PI };
      case 2: return { x: block.x + inset - along, z: block.z + inset,
                       heading: Math.PI / 2 };
      default: return { x: block.x - inset, z: block.z + inset - along,
                        heading: 0 };
    }
  }

  /** Put someone on a block near the player, but not on top of them. */
  place(person, x, z) {
    const centers = this.city.blockCenters;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const [bx, bz] = centers[Math.floor(this.random() * centers.length)];
      const distance = Math.hypot(bx - x, bz - z);
      if (distance < 30 || distance > CITY.pedestrianRange) continue;
      person.block = { x: bx, z: bz };
      person.t = this.random() * this.perimeter;
      person.dir = this.random() < 0.5 ? 1 : -1;
      person.speed = 1.0 + this.random() * 0.7;
      person.phase = this.random() * Math.PI * 2;
      this.apply(person);
      return true;
    }
    return false;
  }

  reset(x, z) {
    for (const person of this.people) this.place(person, x, z);
  }

  apply(person) {
    const at = this.pointAt(person.block, person.t);
    person.root.position.set(at.x, 0, at.z);
    // Walking the loop backwards means facing the other way.
    person.root.rotation.y = at.heading + (person.dir > 0 ? 0 : Math.PI);
  }

  update(dt, x, z) {
    for (const person of this.people) {
      person.t += person.dir * person.speed * dt;
      person.phase += person.speed * dt * 3.4;

      const swing = Math.sin(person.phase) * 0.55;
      if (person.legs[0]) person.legs[0].rotation.x = swing;
      if (person.legs[1]) person.legs[1].rotation.x = -swing;

      this.apply(person);

      const away = Math.hypot(person.block.x - x, person.block.z - z);
      if (away > CITY.pedestrianRange + 40) this.place(person, x, z);
    }
  }
}
