/**
 * One pooled particle system for everything that sparkles or breaks:
 * coin glints, smashed obstacles, landing dust, wing trails.
 */

import * as THREE from 'three';
import { COLORS } from './config.js';

const MAX = 320;

export class Effects {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.22, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.color = new THREE.Color();
    for (let i = 0; i < MAX; i += 1) this.pos[i * 3 + 1] = -500;
  }

  spawn(x, y, z, color, n, speed, life, spread = 1) {
    this.color.setHex(color);
    for (let k = 0; k < n; k += 1) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.3 * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.3 * spread;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3 * spread;
      this.vel[i * 3] = (Math.random() - 0.5) * speed;
      this.vel[i * 3 + 1] = Math.random() * speed * 0.8;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.col[i * 3] = this.color.r;
      this.col[i * 3 + 1] = this.color.g;
      this.col[i * 3 + 2] = this.color.b;
      this.life[i] = life * (0.6 + Math.random() * 0.4);
    }
  }

  coin(x, y, z) { this.spawn(x, y, z, COLORS.coin, 6, 2.5, 0.35); }
  smash(x, y, z) { this.spawn(x, y, z, 0xb0b0b0, 26, 7, 0.7, 3); this.spawn(x, y, z, COLORS.shield, 10, 5, 0.5, 2); }
  dust(x, y, z) { this.spawn(x, y, z, 0xcfc8be, 8, 1.8, 0.4, 2); }
  power(x, y, z, color) { this.spawn(x, y, z, color, 24, 4, 0.8, 2); }
  crash(x, y, z) { this.spawn(x, y, z, 0xff6a3c, 30, 6, 0.8, 2); }

  update(dt) {
    for (let i = 0; i < MAX; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -500; continue; }
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
