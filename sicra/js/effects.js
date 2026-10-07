/**
 * One pooled particle system for everything that sparkles or breaks:
 * coin glints, smashed obstacles, landing dust, wing trails.
 */

import * as THREE from 'three';
import { COLORS } from './config.js';

const MAX = 320;

/** A soft round sprite, so particles are glints rather than squares. */
function makeSoftDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
      size: 0.42, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true,
      blending: THREE.AdditiveBlending, map: makeSoftDot(),
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Wind streaks: thin bright slivers that rush past at speed.
    this.streaks = [];
    const streakGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
    for (let i = 0; i < 16; i += 1) {
      const m = new THREE.Mesh(streakGeo, streakMat.clone());
      m.visible = false;
      scene.add(m);
      this.streaks.push({ mesh: m, life: 0 });
    }
    this.streakTimer = 0;
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

  coin(x, y, z) { this.spawn(x, y, z, COLORS.coin, 10, 3, 0.45); this.spawn(x, y, z, 0xffffff, 3, 1.5, 0.3); }
  smash(x, y, z) { this.spawn(x, y, z, 0xb0b0b0, 26, 7, 0.7, 3); this.spawn(x, y, z, COLORS.shield, 10, 5, 0.5, 2); }
  dust(x, y, z) { this.spawn(x, y, z, 0xcfc8be, 8, 1.8, 0.4, 2); }
  power(x, y, z, color) { this.spawn(x, y, z, color, 24, 4, 0.8, 2); }
  crash(x, y, z) { this.spawn(x, y, z, 0xff6a3c, 30, 6, 0.8, 2); }

  /**
   * Keep the wind going. `intensity` 0..1 (from speed / wings); streaks
   * spawn ahead of the runner and sweep back past the camera.
   */
  wind(dt, player, speed, intensity) {
    if (intensity > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) {
        this.streakTimer = 0.09 / intensity;
        const free = this.streaks.find((st) => st.life <= 0);
        if (free) {
          const side = Math.random() < 0.5 ? -1 : 1;
          free.mesh.position.set(player.x + side * (2.5 + Math.random() * 3), 0.6 + Math.random() * 3.5, player.z + 24);
          free.mesh.scale.z = 2 + Math.random() * 3 + speed * 0.1;
          free.mesh.visible = true;
          free.mesh.material.opacity = 0.25 + intensity * 0.3;
          free.life = 0.9;
          free.speed = speed * 0.6 + 6;
        }
      }
    }
    for (const st of this.streaks) {
      if (st.life <= 0) continue;
      st.life -= dt;
      st.mesh.position.z -= st.speed * dt;
      if (st.life <= 0 || st.mesh.position.z < player.z - 12) { st.life = 0; st.mesh.visible = false; }
    }
  }

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
