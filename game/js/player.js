/**
 * The player's car: arcade physics plus the visual tells that sell it --
 * body roll, steered front wheels, rolling tyres and a boost flare.
 *
 * The car always points down -Z; forward progress makes `position.z` fall.
 */

import * as THREE from 'three';
import * as assets from './assets.js';
import * as audio from './audio.js';
import { PLAY, WORLD } from './config.js';

export class Player {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.car = null;
    this.spec = null;
    this.shadow = null;
    this.reset();
  }

  /** Swap in a different car from the garage. */
  setCar(spec) {
    if (this.car) {
      this.group.remove(this.car);
      assets.disposeInstance(this.car);
    }
    this.spec = spec;
    this.car = assets.tintPaint(assets.instance(spec.model), spec.paint);
    this.group.add(this.car);

    this.wheels = assets.wheels(this.car);
    const sample = this.wheels.all[0];
    this.wheelRadius = sample
      ? new THREE.Box3().setFromObject(sample).getSize(new THREE.Vector3()).y / 2
      : 0.33;

    this.size = assets.footprint(spec.model, PLAY.collisionShrink);
    if (this.shadow) this.group.remove(this.shadow);
    this.shadow = this.world.makeShadow(this.size.width, this.size.length);
    this.group.add(this.shadow);

    this.boostFlames = this.makeBoostFlare();
    this.group.add(this.boostFlames);
  }

  makeBoostFlare() {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: 0x63e6ff, transparent: true, opacity: 0.0, depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 1.5, 8, 1, true), material);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(side * 0.3, 0.38, this.size.length * 0.5 + 0.5);
      group.add(cone);
    }
    group.visible = false;
    return group;
  }

  reset() {
    this.speed = 0;
    this.steer = 0;
    this.x = 0;
    this.z = 0;
    this.distance = 0;
    this.nitro = 0;
    this.boosting = false;
    this.boostTimer = 0;
    this.crashed = false;
    this.crashSpin = 0;
    this.shake = 0;
    this.wheelRoll = 0;
    this.scraping = false;
    if (this.group) {
      this.group.position.set(0, 0, 0);
      this.group.rotation.set(0, 0, 0);
    }
  }

  start(startX = 0) {
    this.reset();
    this.x = startX;
    this.group.position.x = startX;
    this.speed = PLAY.startSpeed;
  }

  get topSpeed() {
    return this.spec.topSpeed * (this.boosting ? PLAY.nitroFactor : 1);
  }

  get speedRatio() {
    return Math.min(1, this.speed / this.spec.topSpeed);
  }

  get kmh() {
    return Math.round(this.speed * 3.6);
  }

  addNitro(amount) {
    this.nitro = Math.min(1, this.nitro + amount);
  }

  requestBoost() {
    if (this.crashed || this.boosting || this.nitro < 0.1) return false;
    this.boosting = true;
    this.boostTimer = PLAY.nitroDuration;
    audio.nitro();
    return true;
  }

  crash() {
    if (this.crashed) return;
    this.crashed = true;
    this.boosting = false;
    this.shake = 1.0;
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random());
    audio.crash();
  }

  update(dt, input, roadHalfWidth) {
    if (this.crashed) return this.updateCrash(dt);

    // --- longitudinal ------------------------------------------------------
    if (this.boosting) {
      this.boostTimer -= dt;
      this.nitro -= dt / PLAY.nitroDuration;
      if (this.nitro <= 0 || this.boostTimer <= 0) {
        this.boosting = false;
        this.nitro = Math.max(0, this.nitro);
      }
    }

    const target = this.topSpeed;
    if (input.brake) {
      this.speed = Math.max(0, this.speed - PLAY.brakeDecel * dt);
    } else if (input.throttle > 0) {
      const push = this.spec.accel * input.throttle
        * (this.boosting ? 1.6 : 1)
        // acceleration tapers off near the top of the range
        * (1 - 0.75 * Math.min(1, this.speed / target));
      this.speed = Math.min(target, this.speed + push * dt);
    } else {
      this.speed = Math.max(0, this.speed - PLAY.coastDecel * dt);
    }
    if (this.speed > target) {
      this.speed = Math.max(target, this.speed - PLAY.brakeDecel * 0.35 * dt);
    }

    // --- lateral -----------------------------------------------------------
    this.steer += (input.steer - this.steer)
      * Math.min(1, PLAY.steerLerp * dt);
    const grip = 1 - (1 - PLAY.steerAtTopSpeed) * this.speedRatio;
    const lateral = this.steer * PLAY.steerBase * this.spec.handling * grip
      // no steering authority when stopped
      * Math.min(1, this.speed / 6);
    this.x += lateral * dt;

    const limit = roadHalfWidth - this.size.width * 0.5;
    this.scraping = false;
    if (this.x < -limit || this.x > limit) {
      this.x = Math.max(-limit, Math.min(limit, this.x));
      this.speed = Math.max(0, this.speed - PLAY.scrapeDecel * dt);
      this.scraping = true;
      this.shake = Math.max(this.shake, 0.35);
    }

    // --- integrate ---------------------------------------------------------
    const travelled = this.speed * dt;
    this.z -= travelled;
    this.distance += travelled;

    this.applyTransform(dt, lateral);
    return travelled;
  }

  updateCrash(dt) {
    this.speed = Math.max(0, this.speed - PLAY.brakeDecel * 0.9 * dt);
    this.z -= this.speed * dt;
    this.crashSpin *= 1 - Math.min(1, dt * 1.2);
    this.group.rotation.y += this.crashSpin * dt;
    this.group.rotation.z *= 1 - Math.min(1, dt * 3);
    this.group.position.set(this.x, 0, this.z);
    this.shake = Math.max(0, this.shake - dt * 0.9);
    return 0;
  }

  applyTransform(dt, lateral) {
    this.group.position.set(this.x, 0, this.z);
    // Lean into the corner, and let the nose yaw slightly toward the drift.
    this.group.rotation.z = -this.steer * PLAY.bodyRollMax;
    this.group.rotation.y = -lateral * 0.035;

    this.wheelRoll -= (this.speed / Math.max(this.wheelRadius, 0.1)) * dt;
    for (const wheel of this.wheels.all) wheel.rotation.x = this.wheelRoll;
    for (const wheel of this.wheels.front) {
      // A wheel's own forward is -Z, so steering right is a negative yaw.
      wheel.rotation.y = -this.steer * PLAY.wheelTurnMax;
    }

    if (this.boostFlames) {
      const active = this.boosting;
      this.boostFlames.visible = active;
      if (active) {
        const flicker = 0.55 + Math.random() * 0.35;
        this.boostFlames.children.forEach((cone) => {
          cone.material.opacity = flicker;
          cone.scale.z = 0.8 + Math.random() * 0.5;
        });
      }
    }

    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  /** Axis-aligned footprint used by collision checks. */
  get box() {
    return {
      x: this.x,
      z: this.z,
      width: this.size.width,
      length: this.size.length,
    };
  }

  rebase(offset) {
    this.z -= offset;
    this.group.position.z = this.z;
  }
}
