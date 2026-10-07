/**
 * The stage: renderer, camera, lights, sky dome, clouds, sun, the sea on one
 * side, a pastel city far below on the other, the far skyline across the
 * water, and the time-of-day cycle that drives all of their colours.
 *
 * Art direction: bright low-poly pastel. It is never dark — the cycle goes
 * day → golden hour → blue hour → dawn → day, and even the blue hour stays
 * well lit with glowing windows.
 *
 * Nothing here knows about the run itself; `update(playerPos, distance, dt)`
 * is all it needs.
 */

import * as THREE from 'three';
import { DAY, ROOF } from './config.js';

/* ------------------------------------------------------------ day cycle */

const KEYS = [
  { at: 0.00, top: 0x3f8fe0, horizon: 0xcfe9ff, fog: 0xdcecff, sun: 0xfff3e0, sunI: 1.7, hemi: 0xcfe9ff, ground: 0x9a8f86, amb: 1.0, windows: 0.0, stars: 0.0, sunAlt: 0.75 },
  { at: 0.25, top: 0x5f8fd8, horizon: 0xffd0a0, fog: 0xf5d9bb, sun: 0xffc98a, sunI: 1.5, hemi: 0xffe0bd, ground: 0x8f7468, amb: 0.95, windows: 0.5, stars: 0.0, sunAlt: 0.18 },
  { at: 0.45, top: 0x5661b8, horizon: 0xf7a9c4, fog: 0xe9c4d8, sun: 0xe6cfff, sunI: 1.15, hemi: 0xd8c8f5, ground: 0x7c7496, amb: 1.0, windows: 1.0, stars: 0.6, sunAlt: 0.10 },
  { at: 0.60, top: 0x5661b8, horizon: 0xf7a9c4, fog: 0xe9c4d8, sun: 0xe6cfff, sunI: 1.15, hemi: 0xd8c8f5, ground: 0x7c7496, amb: 1.0, windows: 1.0, stars: 0.6, sunAlt: 0.10 },
  { at: 0.80, top: 0x5a86d6, horizon: 0xffe0b8, fog: 0xf0e2f7, sun: 0xffe6c0, sunI: 1.45, hemi: 0xf4e3d0, ground: 0x8e8278, amb: 1.0, windows: 0.35, stars: 0.0, sunAlt: 0.30 },
  { at: 1.00, top: 0x3f8fe0, horizon: 0xcfe9ff, fog: 0xdcecff, sun: 0xfff3e0, sunI: 1.7, hemi: 0xcfe9ff, ground: 0x9a8f86, amb: 1.0, windows: 0.0, stars: 0.0, sunAlt: 0.75 },
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

/* ------------------------------------------------------------- palette */

export const PASTEL = [0xf6dfd0, 0xf1cfc4, 0xe3dcf2, 0xd3e6f4, 0xf5e9cf, 0xdbeedd, 0xf7d9e3];

/* ------------------------------------------------------------- textures */

/**
 * Facade texture: a pastel wall with soft blue windows in white frames; a
 * second canvas holds the window glow for the emissive map. Three variants
 * so a street does not look tiled.
 */
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
  const base = ['#f3dccb', '#e9d6e8', '#d9e6ee'][seed % 3];
  wc.fillStyle = base;
  wc.fillRect(0, 0, size, size);
  lc.fillStyle = '#000';
  lc.fillRect(0, 0, size, size);
  const cols = 3;
  const rows = 4;
  const cw = size / cols;
  const ch = size / rows;
  for (let y = 0; y < rows; y += 1) {
    wc.fillStyle = 'rgba(255,255,255,0.35)';       // faint floor line
    wc.fillRect(0, y * ch, size, 3);
    for (let x = 0; x < cols; x += 1) {
      const px = x * cw + cw * 0.24;
      const py = y * ch + ch * 0.22;
      const w = cw * 0.52;
      const h = ch * 0.5;
      wc.fillStyle = '#fbfbfd';                       // frame
      wc.fillRect(px - 4, py - 4, w + 8, h + 8);
      wc.fillStyle = '#a9d3ec';                       // glass
      wc.fillRect(px, py, w, h);
      wc.fillStyle = 'rgba(255,255,255,0.45)';        // sky reflection
      wc.fillRect(px, py, w, h * 0.35);
      if (rnd() < 0.5) {
        lc.fillStyle = rnd() < 0.75 ? '#ffd79a' : '#cfe8ff';
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

/** Roof: light warm concrete with a thin tile grid. */
export function makeRoofTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfc6bb';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i += 1) {
    const v = 195 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(90,70,60,0.22)';
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
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // Fog reaches far so distant things soften into the sky instead of
    // disappearing: depth without darkness.
    this.scene.fog = new THREE.Fog(0xdcecff, 50, 620);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
    this.cameraTarget = new THREE.Vector3();
    this.cameraPos = new THREE.Vector3(0, 4.4, -8.2);
    this.shake = 0;

    this.day = {
      top: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(),
      sun: new THREE.Color(), hemi: new THREE.Color(), ground: new THREE.Color(),
      sunI: 1, amb: 1, windows: 0, stars: 0, sunAlt: 0.7,
    };
    this.phase = 0;

    this.buildLights();
    this.buildSky();
    this.buildClouds();
    this.buildGround();
    this.buildSea();
    this.buildSkyline();
    this.buildCity();

    // Shared materials the track uses; the day cycle drives their emissive.
    this.facades = [0, 1, 2].map((i) => {
      const tex = makeFacadeTextures(i + 7);
      return new THREE.MeshStandardMaterial({
        map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff,
        emissiveIntensity: 0.0, roughness: 0.95, metalness: 0.0,
      });
    });
    this.roofMaterial = new THREE.MeshStandardMaterial({ map: makeRoofTexture(), roughness: 1, metalness: 0 });
    this.darkMaterial = new THREE.MeshStandardMaterial({ color: 0x8f8a96, roughness: 1 });

    this.resize();
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe9ff, 0x9a8f86, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3e0, 1.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 90;
    cam.left = -14; cam.right = 14; cam.top = 24; cam.bottom = -10;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(700, 24, 12);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f8fe0) },
        horizon: { value: new THREE.Color(0xcfe9ff) },
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
          float t = smoothstep(-0.02, 0.6, vY);
          vec3 c = mix(horizon, top, t);
          // a touch of extra brightness right at the horizon
          c += vec3(0.08) * (1.0 - smoothstep(0.0, 0.12, abs(vY - 0.03)));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMaterial);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // A few faint stars for the blue hour.
    const count = 260;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 0.7);
      const r = 650;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sgeo, this.starMaterial);
    this.scene.add(this.stars);

    // The sun: a bright disc with a soft halo.
    this.sunDisc = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(22, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }));
    const halo = new THREE.Mesh(new THREE.CircleGeometry(60, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.z = -0.5;
    this.sunDisc.add(halo, disc);
    this.scene.add(this.sunDisc);
  }

  buildClouds() {
    // Flat-shaded puffs: clusters of squashed spheres, far and high.
    this.clouds = new THREE.Group();
    this.cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, transparent: true, opacity: 0.92 });
    const puff = new THREE.SphereGeometry(1, 10, 7);
    this.cloudSpan = 700;
    let s = 4242;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 14; i += 1) {
      const cloud = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 3);
      let x = 0;
      for (let k = 0; k < n; k += 1) {
        const r = 7 + rnd() * 9;
        const m = new THREE.Mesh(puff, this.cloudMaterial);
        m.scale.set(r * 1.6, r * 0.7, r);
        m.position.set(x, (rnd() - 0.5) * 3, (rnd() - 0.5) * 6);
        cloud.add(m);
        x += r * 1.4;
      }
      cloud.position.set((rnd() - 0.5) * 420, 70 + rnd() * 70, 0);
      cloud.userData.base = (rnd() - 0.5) * this.cloudSpan;
      cloud.userData.drift = 0.4 + rnd() * 0.6;
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
  }

  buildGround() {
    // The street, far below: light warm asphalt so the drop reads as depth,
    // not as a black hole.
    this.groundY = -ROOF.depthMax - 2;
    const geo = new THREE.PlaneGeometry(900, 900);
    geo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9fa3ad, roughness: 1 }));
    this.ground.position.y = this.groundY;
    this.scene.add(this.ground);
  }

  buildSea() {
    const geo = new THREE.PlaneGeometry(800, 900, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.seaMaterial = new THREE.MeshStandardMaterial({ color: 0x7cc4e6, roughness: 0.25, metalness: 0.35 });
    this.sea = new THREE.Mesh(geo, this.seaMaterial);
    // The camera looks along +z, so -x is screen-right: the sea is there.
    this.sea.position.set(-14 - 400, this.groundY + 0.5, 0);
    this.scene.add(this.sea);
  }

  /** Far skyline across the water: pastel towers, a mosque, a bridge. */
  buildSkyline() {
    this.skyline = new THREE.Group();
    this.skylineMaterials = PASTEL.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
    const windowPos = [];
    let s = 12345;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const mat = () => this.skylineMaterials[Math.floor(rnd() * this.skylineMaterials.length)];
    const box = (x, y, w, h, d, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat());
      m.position.set(x, y + h / 2, z);
      this.skyline.add(m);
      const n = Math.floor(h / 5);
      for (let i = 0; i < n; i += 1) {
        windowPos.push(x + w / 2 + 0.3, y + 2 + rnd() * (h - 4), z + (rnd() - 0.5) * d * 0.9);
      }
      return m;
    };
    const baseY = this.groundY;
    const span = 600;
    this.skylineSpan = span;
    let z = -span / 2;
    while (z < span / 2) {
      const w = 14 + rnd() * 26;
      const h = 16 + rnd() * rnd() * 90;
      const x = -160 - rnd() * 70;
      box(x, baseY, w, h, w, z + w / 2);
      z += w + 6 + rnd() * 16;
    }
    // Mosque: dome on a base, four minarets.
    const mx = -175;
    const mz = 40;
    const stone = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 1 });
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x8fb8c9, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(44, 26, 44), stone);
    base.position.set(mx, baseY + 13, mz);
    this.skyline.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.set(mx, baseY + 26, mz);
    this.skyline.add(dome);
    for (const [dx, dz] of [[-28, -28], [28, -28], [-28, 28], [28, 28]]) {
      const min = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 62, 8), stone);
      min.position.set(mx + dx, baseY + 31, mz + dz);
      this.skyline.add(min);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 8), domeMat);
      tip.position.set(mx + dx, baseY + 66, mz + dz);
      this.skyline.add(tip);
    }
    // Bridge: two towers and a deck, further back.
    const bx = -250;
    const bz = -140;
    const red = new THREE.MeshStandardMaterial({ color: 0xd9776a, roughness: 1 });
    for (const dz of [-60, 60]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 70, 6), red);
      tower.position.set(bx, baseY + 35, bz + dz);
      this.skyline.add(tower);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 200), red);
    deck.position.set(bx, baseY + 28, bz);
    this.skyline.add(deck);
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.Float32BufferAttribute(windowPos, 3));
    this.skylineWindows = new THREE.Points(wgeo, new THREE.PointsMaterial({ color: 0xffd48a, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.skyline.add(this.skylineWindows);
    this.scene.add(this.skyline);
  }

  /**
   * The city on the land side (+x, screen-left): low pastel blocks whose
   * roofs mostly stay below ours, so the run reads as being up high and
   * nothing crowds the lane view. Repeats every `citySpan` metres.
   */
  buildCity() {
    this.city = new THREE.Group();
    this.citySpan = 480;
    let s = 777;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const mats = PASTEL.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
    const trim = new THREE.MeshStandardMaterial({ color: 0xfaf6ef, roughness: 1 });
    const bands = [
      { x0: 22, x1: 46, topMin: -16, topMax: -6 },
      { x0: 50, x1: 90, topMin: -12, topMax: 4 },
      { x0: 96, x1: 150, topMin: -6, topMax: 18 },
    ];
    for (const band of bands) {
      let z = -this.citySpan / 2;
      while (z < this.citySpan / 2) {
        const w = 8 + rnd() * 14;
        const d = 10 + rnd() * 18;
        const top = band.topMin + rnd() * (band.topMax - band.topMin);
        const h = top - this.groundY;
        const x = band.x0 + rnd() * (band.x1 - band.x0 - w) + w / 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[Math.floor(rnd() * mats.length)]);
        m.position.set(x, this.groundY + h / 2, z + d / 2);
        this.city.add(m);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), trim);
        cap.position.set(x, top + 0.25, z + d / 2);
        this.city.add(cap);
        z += d + 3 + rnd() * 8;
      }
    }
    this.scene.add(this.city);
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
    this.starMaterial.opacity = d.stars * 0.8;
    this.skylineWindows.material.opacity = d.windows;
    for (const m of this.facades) m.emissiveIntensity = d.windows * 1.1;
    this.seaMaterial.color.copy(d.horizon).lerp(tmpA.setHex(0x3f9fd4), 0.7);
    this.cloudMaterial.color.copy(d.horizon).lerp(tmpA.setHex(0xffffff), 0.75);

    // sun: over the sea side (-x), altitude from the cycle
    const alt = d.sunAlt;
    this.sun.position.set(p.x - 26 * (1 - alt) - 8, 14 + alt * 46, p.z - 14 + alt * 12);
    this.sun.target.position.set(p.x, 0, p.z + 6);
    this.sun.target.updateMatrixWorld();
    this.sunDisc.position.set(p.x - 520 * (1 - alt * 0.5), 40 + alt * 420, p.z + 260);
    this.sunDisc.lookAt(this.camera.position);

    // things that follow the player
    this.sky.position.set(p.x, 0, p.z);
    this.stars.position.copy(this.sky.position);
    this.ground.position.z = p.z;
    this.sea.position.z = p.z;
    this.skyline.position.z = Math.round(p.z / this.skylineSpan) * this.skylineSpan;
    this.city.position.z = Math.round(p.z / this.citySpan) * this.citySpan;
    // clouds: follow the player, parallax a little, drift slowly
    this.clouds.position.z = p.z;
    const span = this.cloudSpan;
    for (const cloud of this.clouds.children) {
      const u = cloud.userData;
      u.base += u.drift * dt;
      cloud.position.z = (((u.base - p.z * 0.15) % span) + span * 1.5) % span - span / 2;
    }

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
