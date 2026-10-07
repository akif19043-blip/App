/**
 * The night guard. He runs a few metres behind and replays the runner's
 * recent path, so he jumps where you jumped and ducks where you ducked.
 * When you are caught he closes the distance in under a second.
 */

import * as THREE from 'three';
import { CHASER, SPEED } from './config.js';
import { makeFigure, poseFigure } from './figure.js';

const LOOK = { shirt: 0x24305a, pants: 0x1b2340, skin: 0xe8c39e, hair: 0x2a2a2a, hat: 'cap', hatColor: 0x1b2340 };

export class Chaser {
  constructor(scene) {
    this.group = new THREE.Group();
    this.figure = makeFigure(LOOK);
    this.group.add(this.figure.root);
    // flashlight: a soft additive cone in front of him
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 5, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0.35, 1.3, 2.6);
    this.group.add(cone);
    this.light = cone;
    scene.add(this.group);
    this.history = [];
    this.reset();
  }

  reset() {
    this.history.length = 0;
    this.gap = CHASER.gapStart;
    this.catching = 0;
    this.phase = 0;
    this.group.visible = true;
    this.group.position.set(0, 0, -CHASER.gapStart);
    this.group.rotation.set(0, 0, 0);
    poseFigure(this.figure, 'run', 0, 0.1);
  }

  /** Record the runner's pose this frame. */
  record(player) {
    this.history.push({ x: player.x, y: player.y, z: player.z, state: player.state });
    if (this.history.length > 400) this.history.splice(0, 100);
  }

  /** Flashlight strength: only worth seeing after dark. */
  setNight(amount) {
    this.light.material.opacity = 0.07 * amount;
  }

  update(dt, player, speed, dead) {
    this.record(player);
    const ratio = Math.min(1, (speed - SPEED.start) / (SPEED.max - SPEED.start));
    const wantGap = dead === 'caught' ? 0.9 : CHASER.gapStart + (CHASER.gapFar - CHASER.gapStart) * ratio;
    const k = 1 - Math.exp(-dt * (dead === 'caught' ? 6 : 0.8));
    this.gap += (wantGap - this.gap) * k;

    // find the sample closest to player.z - gap
    const targetZ = player.z - this.gap;
    let sample = this.history[0];
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (this.history[i].z <= targetZ) { sample = this.history[i]; break; }
    }
    if (!sample) sample = { x: player.x, y: 0, z: targetZ, state: 'run' };

    if (dead === 'fell') {
      // stop at the edge and lean over
      this.group.position.z = Math.min(this.group.position.z + speed * dt, player.z - 2.5);
      this.group.position.y = 0;
      poseFigure(this.figure, 'idle', 0, 0.5);
      this.light.visible = true;
      return;
    }

    const stride = Math.max(0.6, 1.9 - speed * 0.03);
    this.phase += (speed / stride) * dt * Math.PI;
    // run half a step to the side so the runner is not hidden behind him
    const side = dead === 'caught' ? 0 : 0.9;
    this.group.position.set(sample.x + side, dead === 'caught' ? 0 : sample.y, targetZ);
    const state = dead === 'caught' ? 'run' : (sample.state === 'fly' ? 'run' : sample.state);
    poseFigure(this.figure, state, this.phase, 0.1 + speed * 0.01);
    this.light.visible = !dead;
  }
}
