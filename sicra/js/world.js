/**
 * The stage: renderer, camera, lights, sky dome, stars, moon, the sea on the
 * left, the far skyline across the water, the street far below, and the
 * time-of-day cycle that drives all of their colours.
 *
 * Nothing here knows about the run itself; `update(playerPos, distance, dt)`
 * is all it needs.
 */

import * as THREE from 'three';
import { DAY, ROOF } from './config.js';

/* ------------------------------------------------------------ day cycle */

// Keyframes along the cycle. Each colour is interpolated between neighbours.
const KEYS = [
  { at: 0.00, top: 0x2a1b4a, horizon: 0xff7a3c, fog: 0xd8775a, sun: 0xffb070, sunI: 1.1, hemi: 0xffb080, ground: 0x4a2a30, amb: 0.55, windows: 0.35, stars: 0.0, sunAlt: 0.10 },
  { at: 0.22, top: 0x060a18, horizon: 0x15224a, fog: 0x121c33, sun: 0xa9bcff, sunI: 0.8, hemi: 0x3c4f86, ground: 0x14121f, amb: 0.6, windows: 1.0, stars: 1.0, sunAlt: 0.60 },
  { at: 0.50, top: 0x060a18, horizon: 0x15224a, fog: 0x121c33, sun: 0xa9bcff, sunI: 0.8, hemi: 0x3c4f86, ground: 0x14121f, amb: 0.6, windows: 1.0, stars: 1.0, sunAlt: 0.60 },
  { at: 0.62, top: 0x2f3a7c, horizon: 0xffb27a, fog: 0xd6a080, sun: 0xffc890, sunI: 0.9, hemi: 0xc0b0ff, ground: 0x3a3040, amb: 0.5, windows: 0.3, stars: 0.0, sunAlt: 0.08 },
  { at: 0.78, top: 0x3f8fe0, horizon: 0xbfe0ff, fog: 0xc9e2ff, sun: 0xfff2dc, sunI: 1.5, hemi: 0xbfe0ff, ground: 0x6a6a70, amb: 0.7, windows: 0.0, stars: 0.0, sunAlt: 0.75 },
  { at: 0.90, top: 0x3f8fe0, horizon: 0xbfe0ff, fog: 0xc9e2ff, sun: 0xfff2dc, sunI: 1.5, hemi: 0xbfe0ff, ground: 0x6a6a70, amb: 0.7, windows: 0.0, stars: 0.0, sunAlt: 0.55 },
  { at: 1.00, top: 0x2a1b4a, horizon: 0xff7a3c, fog: 0xd8775a, sun: 0xffb070, sunI: 1.1, hemi: 0xffb080, ground: 0x4a2a30, amb: 0.55, windows: 0.35, stars: 0.0, sunAlt: 0.10 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function sampleDay(phase, out) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].at <= phase) i += 1;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (phase - a.at) / (b.at - a.at)));
  const s = t * t * (3 - 2 * t);
  for (const key of ['top', 'horizon', 'fog', 'sun', 'hemi', 'ground']) {
    tmpA.setHex(a[key]);
    tmpB.setHex(b[key]);
    out[key].copy(tmpA).lerp(tmpB, s);
  }
  for (const key of ['sunI', 'amb', 'windows', 'stars', 'sunAlt']) {
    out[key] = a[key] + (b[key] - a[key]) * s;
  }
  return out;
}

/* ------------------------------------------------------------- textures */

/** Facade texture: dark wall with a grid of windows; a second canvas holds
 *  only the lit ones for the emissive map. Three variants, picked per
 *  building, so a street does not look tiled. */
export function makeFacadeTextures(seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const size = 256;
  const wall = document.createElement('canvas');
  wall.width = wall.height = size;
  const lit = document.createElement('canvas');
  lit.width = lit.height = size;
  const wc = wall.getContext('2d');
  const lc = lit.getContext('2d');
  const base = ['#3a3f4c', '#4a4038', '#2f3744'][seed % 3];
  wc.fillStyle = base;
  wc.fillRect(0, 0, size, size);
  lc.fillStyle = '#000';
  lc.fillRect(0, 0, size, size);
  const cols = 4;
  const rows = 5;
  const cw = size / cols;
  const ch = size / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = x * cw + cw * 0.22;
      const py = y * ch + ch * 0.2;
      const w = cw * 0.56;
      const h = ch * 0.55;
      wc.fillStyle = '#1b2029';
      wc.fillRect(px, py, w, h);
      wc.fillStyle = 'rgba(255,255,255,0.08)';
      wc.fillRect(px, py, w, h * 0.3);
      if (rnd() < 0.55) {
        const warm = rnd() < 0.7;
        lc.fillStyle = warm ? '#ffd27a' : '#bfe3ff';
        lc.fillRect(px, py, w, h);
      }
    }
  }
  const map = new THREE.CanvasTexture(wall);
  const emissive = new THREE.CanvasTexture(lit);
  for (const tex of [map, emissive]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  return { map, emissive };
}

export function makeRoofTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b6560';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i += 1) {
    const v = 90 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------------------------------------------------------- world */

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd8775a, 45, 170);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
    this.cameraTarget = new THREE.Vector3();
    this.cameraPos = new THREE.Vector3(0, 4.4, -8.2);
    this.shake = 0;

    this.day = {
      top: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(),
      sun: new THREE.Color(), hemi: new THREE.Color(), ground: new THREE.Color(),
      sunI: 1, amb: 0.5, windows: 0.3, stars: 0, sunAlt: 0.1,
    };
    this.phase = 0;

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildSea();
    this.buildSkyline();

    // Shared materials the track uses; the day cycle drives their emissive.
    this.facades = [0, 1, 2].map((i) => {
      const tex = makeFacadeTextures(i + 7);
      return new THREE.MeshStandardMaterial({
        map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff,
        emissiveIntensity: 0.3, roughness: 0.9, metalness: 0.0,
      });
    });
    this.roofMaterial = new THREE.MeshStandardMaterial({ map: makeRoofTexture(), roughness: 1, metalness: 0 });
    this.darkMaterial = new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 1 });

    this.resize();
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffb080, 0x4a2a30, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffb070, 1.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 80;
    cam.left = -14; cam.right = 14; cam.top = 22; cam.bottom = -10;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(450, 24, 12);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x2a1b4a) },
        horizon: { value: new THREE.Color(0xff7a3c) },
      },
      vertexShader: `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; varying float vY;
        void main() {
          float t = smoothstep(-0.05, 0.55, vY);
          gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMaterial);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // Stars: random points on the upper dome.
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v * 0.9);       // keep them above the horizon
      const r = 420;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sgeo, this.starMaterial);
    this.scene.add(this.stars);

    // Moon and sun discs.
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(14, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false, transparent: true, opacity: 0 }));
    this.scene.add(this.moon);
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(18, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false, transparent: true, opacity: 0.9 }));
    this.scene.add(this.sunDisc);
  }

  buildGround() {
    // The street, deep below the roofs. Dark, with a faint grid of lamps.
    this.groundY = -ROOF.depthMax - 2;
    const geo = new THREE.PlaneGeometry(500, 500);
    geo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 1 }));
    this.ground.position.y = this.groundY;
    this.ground.receiveShadow = false;
    this.scene.add(this.ground);

    const lampCount = 60;
    const pos = new Float32Array(lampCount * 3);
    for (let i = 0; i < lampCount; i += 1) {
      pos[i * 3] = (i % 2 ? 7.5 : -7.5);
      pos[i * 3 + 1] = this.groundY + 4;
      pos[i * 3 + 2] = (i >> 1) * 14;
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lamps = new THREE.Points(lgeo, new THREE.PointsMaterial({ color: 0xffc88a, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.lamps);
  }

  buildSea() {
    const geo = new THREE.PlaneGeometry(600, 700, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.seaMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2f55, roughness: 0.25, metalness: 0.6 });
    this.sea = new THREE.Mesh(geo, this.seaMaterial);
    this.sea.position.set(-16 - 300, this.groundY + 0.5, 0);
    this.scene.add(this.sea);
  }

  buildSkyline() {
    // Silhouettes across the water: towers, a mosque, a bridge. One 600 m
    // stretch, snapped along z so it repeats unnoticed at that distance.
    this.skyline = new THREE.Group();
    this.skylineMaterial = new THREE.MeshBasicMaterial({ color: 0x1a1030, fog: false });
    const windowPos = [];
    const box = (x, y, w, h, d, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.skylineMaterial);
      m.position.set(x, y + h / 2, z);
      this.skyline.add(m);
      // scatter a few lit windows on the face towards us
      const n = Math.floor(h / 4);
      for (let i = 0; i < n; i += 1) {
        windowPos.push(x + w / 2 + 0.3, y + 2 + Math.random() * (h - 4), z + (Math.random() - 0.5) * d * 0.9);
      }
      return m;
    };
    const baseY = this.groundY;
    const span = 600;
    this.skylineSpan = span;
    let z = -span / 2;
    let s = 12345;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    while (z < span / 2) {
      const w = 14 + rnd() * 26;
      const h = 18 + rnd() * rnd() * 95;
      const x = -150 - rnd() * 60;
      box(x, baseY, w, h, w, z + w / 2);
      z += w + 4 + rnd() * 14;
    }
    // Mosque: dome on a base, four minarets.
    const mx = -165;
    const mz = 40;
    box(mx, baseY, 44, 26, 44, mz);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.skylineMaterial);
    dome.position.set(mx, baseY + 26, mz);
    this.skyline.add(dome);
    for (const [dx, dz] of [[-28, -28], [28, -28], [-28, 28], [28, 28]]) {
      const min = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 62, 8), this.skylineMaterial);
      min.position.set(mx + dx, baseY + 31, mz + dz);
      this.skyline.add(min);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 8), this.skylineMaterial);
      tip.position.set(mx + dx, baseY + 66, mz + dz);
      this.skyline.add(tip);
    }
    // Bridge: two towers and a deck, further back.
    const bx = -230;
    const bz = -140;
    box(bx, baseY, 6, 70, 6, bz - 60);
    box(bx, baseY, 6, 70, 6, bz + 60);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 200), this.skylineMaterial);
    deck.position.set(bx, baseY + 28, bz);
    this.skyline.add(deck);
    for (let i = 0; i < 12; i += 1) {
      windowPos.push(bx + 3, baseY + 30, bz - 90 + i * 16.4);
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.Float32BufferAttribute(windowPos, 3));
    this.skylineWindows = new THREE.Points(wgeo, new THREE.PointsMaterial({ color: 0xffd48a, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.skyline.add(this.skylineWindows);
    this.scene.add(this.skyline);
  }

  /** Quality level changed: pixel ratio and shadows. */
  applyQuality(level) {
    this.renderer.setPixelRatio(Math.min(level.pixelRatio, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = level.shadows;
    this.sun.castShadow = level.shadows;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a taller view to see the next roof coming.
    this.camera.fov = this.camera.aspect < 0.8 ? 72 : this.camera.aspect < 1.2 ? 64 : 56;
    this.camera.updateProjectionMatrix();
  }

  /** Jolt the camera (crash, shield smash). */
  kick(amount = 1) {
    this.shake = Math.max(this.shake, amount);
  }

  /**
   * @param {THREE.Vector3} p   player position (feet)
   * @param {number} distance   metres run so far, drives the day cycle
   * @param {number} dt
   * @param {object} opts       { lookBack: 0..1 }  turn toward the chaser on death
   */
  update(p, distance, dt, opts = {}) {
    // day cycle
    this.phase = (distance / DAY.cycleDistance + (opts.phaseOffset || 0)) % 1;
    const d = sampleDay(this.phase, this.day);
    this.skyMaterial.uniforms.top.value.copy(d.top);
    this.skyMaterial.uniforms.horizon.value.copy(d.horizon);
    this.scene.fog.color.copy(d.fog);
    this.hemi.color.copy(d.hemi);
    this.hemi.groundColor.copy(d.ground);
    this.hemi.intensity = d.amb;
    this.sun.color.copy(d.sun);
    this.sun.intensity = d.sunI;
    this.starMaterial.opacity = d.stars;
    this.skylineWindows.material.opacity = d.windows;
    this.moon.material.opacity = d.stars;
    this.sunDisc.material.opacity = Math.max(0, 1 - d.stars * 1.4);
    this.skylineMaterial.color.copy(d.fog).multiplyScalar(0.25).lerp(new THREE.Color(0x06070f), d.stars * 0.8);
    for (const m of this.facades) m.emissiveIntensity = d.windows * 1.3;
    this.seaMaterial.color.copy(d.horizon).multiplyScalar(0.35).lerp(new THREE.Color(0x0a1b3a), 0.55);
    this.lamps.material.opacity = 0.2 + d.windows * 0.8;

    // sun direction: from the sea side, altitude from the cycle
    const alt = d.sunAlt;
    this.sun.position.set(p.x - 30 * (1 - alt) - 10, 12 + alt * 50, p.z - 18 + alt * 10);
    this.sun.target.position.set(p.x, 0, p.z + 6);
    this.sun.target.updateMatrixWorld();
    this.sunDisc.position.set(p.x - 380 * (1 - alt * 0.6), 20 + alt * 300, p.z + 120);
    this.sunDisc.lookAt(this.camera.position);
    this.moon.position.set(p.x + 180, 220, p.z + 330);
    this.moon.lookAt(this.camera.position);

    // things that follow the player
    this.sky.position.set(p.x, 0, p.z);
    this.stars.position.copy(this.sky.position);
    this.ground.position.z = p.z;
    this.sea.position.z = p.z;
    this.lamps.position.z = Math.floor(p.z / 14) * 14 - 60;
    this.skyline.position.z = Math.round(p.z / this.skylineSpan) * this.skylineSpan;

    // camera
    const look = opts.lookBack || 0;
    const back = 8.2 - look * 3;
    const target = this.cameraTarget;
    target.set(p.x * 0.55, 4.4 + Math.max(0, p.y) * 0.5, p.z - back);
    const k = 1 - Math.exp(-dt * 7);
    this.cameraPos.lerp(target, k);
    if (this.shake > 0) {
      this.cameraPos.x += (Math.random() - 0.5) * 0.3 * this.shake;
      this.cameraPos.y += (Math.random() - 0.5) * 0.3 * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.position.copy(this.cameraPos);
    const aim = new THREE.Vector3(p.x * 0.55, 1.2 + p.y * 0.3, p.z + 10 - look * 13);
    this.camera.lookAt(aim);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
