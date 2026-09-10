/**
 * Free-roam car: a kinematic bicycle model.
 *
 * Unlike the highway mode -- where the car only slides left and right -- this
 * car has a real heading. Steering turns the front wheels, the turn rate falls
 * out of speed and wheelbase, and the car goes where its nose points, so it
 * can drive anywhere on the map and reverse out of a dead end.
 *
 * Heading 0 faces -Z, matching how the glTF models are oriented.
 */

import * as THREE from 'three';
import * as assets from './assets.js';
import * as audio from './audio.js';
import * as environment from './environment.js';
import { DRIVE, PLAY } from './config.js';

export class Car {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.model = null;
    this.spec = null;
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.steerAngle = 0;
    this.wheelRoll = 0;
    this.nitro = 0;
    this.boosting = false;
    this.boostTimer = 0;
    this.shake = 0;
    this.bumped = false;
  }

  setCar(spec) {
    if (this.model) {
      this.group.remove(this.model);
      assets.disposeInstance(this.model);
    }
    this.spec = spec;
    this.model = environment.shadowRole(
      assets.tintPaint(assets.instance(spec.model), spec.paint), 'cast');
    this.group.add(this.model);

    this.wheels = assets.wheels(this.model);
    const sample = this.wheels.all[0];
    this.wheelRadius = sample
      ? new THREE.Box3().setFromObject(sample).getSize(new THREE.Vector3()).y / 2
      : 0.33;

    this.size = assets.footprint(spec.model, PLAY.collisionShrink);
    this.wheelbase = this.size.length * 0.62;
    this.radius = Math.max(this.size.width, this.size.length * 0.55) * 0.5;

    if (this.shadow) this.group.remove(this.shadow);
    this.shadow = environment.makeShadow(this.size.width, this.size.length);
    this.group.add(this.shadow);

    if (this.flare) this.group.remove(this.flare);
    this.flare = this.makeBoostFlare();
    this.group.add(this.flare);
  }

  makeBoostFlare() {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: 0x63e6ff, transparent: true, opacity: 0, depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 1.4, 8, 1, true), material);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(side * 0.3, 0.38, this.size.length * 0.5 + 0.45);
      group.add(cone);
    }
    group.visible = false;
    return group;
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.boosting = false;
    this.boostTimer = 0;
    this.shake = 0;
    this.applyTransform(0);
  }

  get topSpeed() {
    return this.spec.topSpeed * (this.boosting ? PLAY.nitroFactor : 1);
  }

  get kmh() {
    return Math.round(Math.abs(this.speed) * 3.6);
  }

  get speedRatio() {
    return Math.min(1, Math.abs(this.speed) / this.spec.topSpeed);
  }

  /** Unit vector the nose points along. */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  addNitro(amount) {
    this.nitro = Math.min(1, this.nitro + amount);
  }

  requestBoost() {
    if (this.boosting || this.nitro < 0.1 || this.speed < 2) return false;
    this.boosting = true;
    this.boostTimer = PLAY.nitroDuration;
    audio.nitro();
    return true;
  }

  /**
   * @param {number} dt
   * @param {{steer:number, throttle:number, brake:boolean}} input
   * @param {{resolve:Function}} collider  world geometry to slide against
   */
  update(dt, input, collider) {
    if (this.boosting) {
      this.boostTimer -= dt;
      this.nitro = Math.max(0, this.nitro - dt / PLAY.nitroDuration);
      if (this.nitro <= 0 || this.boostTimer <= 0) this.boosting = false;
    }

    this.updateSpeed(dt, input);
    this.updateHeading(dt, input);

    const forward = this.forward();
    let nextX = this.x + forward.x * this.speed * dt;
    let nextZ = this.z + forward.z * this.speed * dt;

    this.bumped = false;
    if (collider) {
      const hit = collider.resolve(nextX, nextZ, this.radius);
      if (hit.hit) {
        nextX = hit.x;
        nextZ = hit.z;
        // Kill the part of the velocity heading into the wall and scrub the
        // rest, so a glancing blow lets you keep going but a head-on stops you.
        const into = -(forward.x * hit.nx + forward.z * hit.nz);
        const severity = Math.max(0, into);
        this.speed *= (1 - 0.85 * severity);
        if (Math.abs(this.speed) > 6 && severity > 0.25) {
          this.shake = Math.max(this.shake, Math.min(1, severity * 0.9));
          audio.scrape();
        }
        this.bumped = true;
      }
    }

    this.x = nextX;
    this.z = nextZ;
    this.reportTyres(input);
    this.applyTransform(dt);
    return Math.abs(this.speed) * dt;
  }

  /** Squeal when the tyres are working: hard braking, or a fast tight corner. */
  reportTyres(input) {
    const fast = Math.abs(this.speed);
    const cornering = Math.abs(this.steerAngle) * fast;
    const braking = input.brake && fast > 14 ? (fast - 14) / 24 : 0;
    const sliding = cornering > DRIVE.squealFrom
      ? (cornering - DRIVE.squealFrom) / 6 : 0;
    const intensity = Math.min(1, Math.max(braking, sliding));
    if (intensity > 0.05) audio.screech(intensity);
    this.squeal = intensity;
  }

  updateSpeed(dt, input) {
    const top = this.topSpeed;
    const braking = PLAY.brakeDecel * (this.spec.brakeScale || 1);
    if (input.brake) {
      if (this.speed > 0.4) {
        this.speed -= braking * dt;
      } else {
        // held past a stop: back up
        this.speed = Math.max(-DRIVE.reverseTopSpeed,
                              this.speed - DRIVE.reverseAccel * dt);
      }
    } else if (input.throttle > 0) {
      if (this.speed < -0.4) {
        this.speed += braking * dt;                  // brake out of reverse
      } else {
        const push = this.spec.accel * input.throttle
          * (this.boosting ? 1.5 : 1)
          * (1 - 0.78 * Math.min(1, this.speed / top));
        this.speed = Math.min(top, this.speed + push * dt);
      }
    } else {
      const drag = PLAY.coastDecel * dt;
      if (this.speed > drag) this.speed -= drag;
      else if (this.speed < -drag) this.speed += drag;
      else this.speed = 0;
    }
    if (this.speed > top) {
      this.speed = Math.max(top, this.speed - PLAY.brakeDecel * 0.4 * dt);
    }
  }

  updateHeading(dt, input) {
    // Lock the wheels down as speed rises, or the car would spin on the spot.
    const limit = DRIVE.maxSteerAngle
      * (DRIVE.steerAtSpeed
         + (1 - DRIVE.steerAtSpeed) * Math.exp(-Math.abs(this.speed) / 26))
      * this.spec.handling;
    const target = input.steer * limit;
    this.steerAngle += (target - this.steerAngle)
      * Math.min(1, DRIVE.steerLerp * dt);

    if (Math.abs(this.speed) > 0.05) {
      // Positive steer means right. Heading 0 faces -Z, and rotation.y maps a
      // heading h to the forward vector (-sin h, 0, -cos h) -- so turning
      // right, toward +X, means the heading has to DECREASE.
      const rate = (this.speed / this.wheelbase) * Math.tan(this.steerAngle);
      this.heading -= rate * dt;
    }
  }

  applyTransform(dt) {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    // Lean out of the corner, proportional to how hard it is actually turning.
    const lean = this.steerAngle * this.speedRatio * DRIVE.bodyRoll;
    this.group.rotation.z += (lean - this.group.rotation.z)
      * Math.min(1, dt * 8);

    this.wheelRoll -= (this.speed / Math.max(this.wheelRadius, 0.1)) * dt;
    for (const wheel of this.wheels.all) wheel.rotation.x = this.wheelRoll;
    // Same sign convention as the heading: the wheel's own forward is -Z.
    for (const wheel of this.wheels.front) wheel.rotation.y = -this.steerAngle;

    if (this.flare) {
      this.flare.visible = this.boosting;
      if (this.boosting) {
        const flicker = 0.55 + Math.random() * 0.35;
        this.flare.children.forEach((cone) => {
          cone.material.opacity = flicker;
          cone.scale.z = 0.8 + Math.random() * 0.5;
        });
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }
}
