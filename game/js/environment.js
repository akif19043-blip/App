/**
 * Shared scene dressing: sky, image-based lighting, fog and blob shadows.
 *
 * Both game modes build their own THREE.Scene, and both get their look from
 * here, so the highway and the city are lit by the same rules.
 *
 * The sky gradient does double duty: it is the visible background AND, run
 * through PMREM, the environment map. Without an environment map every
 * metallic material in the glTF files would render black.
 */

import * as THREE from 'three';

export const TIME_OF_DAY = {
  dusk: {
    top: '#1d2b52', horizon: '#f0a35e', ground: '#6b5340',
    sun: '#ffb066', sunIntensity: 2.9,
    hemiSky: '#ffd9a8', hemiGround: '#6b5340', hemiIntensity: 1.25,
    fogNear: 60, fogFar: 280,
  },
  day: {
    top: '#2f74c0', horizon: '#cfe3f2', ground: '#7d6647',
    sun: '#fff3d8', sunIntensity: 2.6,
    hemiSky: '#bcd8f0', hemiGround: '#7d6647', hemiIntensity: 1.0,
    fogNear: 75, fogFar: 280,
  },
  // Night leans on the emissive materials that are already in the models --
  // lit windows, street lamps, signals and tail lights carry the scene, and
  // the "sun" is a dim cool moon that only shapes the silhouettes.
  night: {
    top: '#050912', horizon: '#16233d', ground: '#0b0e15',
    sun: '#8fa6dd', sunIntensity: 0.62,
    hemiSky: '#33436c', hemiGround: '#15191f', hemiIntensity: 0.78,
    fogNear: 40, fogFar: 210,
    headlights: true,
  },
};

export function preset(name) {
  return TIME_OF_DAY[name] || TIME_OF_DAY.dusk;
}

/** Names a player can pick between, plus 'auto'. */
export const TIMES = ['auto', 'day', 'dusk', 'night'];

export function resolveTime(choice) {
  if (choice && choice !== 'auto' && TIME_OF_DAY[choice]) return choice;
  const options = ['day', 'dusk', 'night'];
  return options[Math.floor(Math.random() * options.length)];
}

export function applySky(scene, renderer, settings, fogRange) {
  const texture = makeSkyTexture(settings);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(texture).texture;

  // Replacing a sky means the old one is nobody's now.
  if (scene.background && scene.background.dispose) scene.background.dispose();
  if (scene.environment && scene.environment.dispose) scene.environment.dispose();
  scene.background = texture;
  scene.environment = environment;
  const near = fogRange ? fogRange[0] : settings.fogNear;
  const far = fogRange ? fogRange[1] : settings.fogFar;
  scene.fog = new THREE.Fog(new THREE.Color(settings.horizon), near, far);

  pmrem.dispose();
  return { texture, environment };
}

/** Direction the sun comes from, normalised. */
export const SUN_DIRECTION = new THREE.Vector3(48, 92, 62).normalize();

export function applyLights(scene, settings, shadows) {
  const sun = new THREE.DirectionalLight(new THREE.Color(settings.sun),
                                         settings.sunIntensity);
  // High and behind the default camera heading, so the cars the player looks
  // at are lit rather than silhouetted.
  sun.position.copy(SUN_DIRECTION).multiplyScalar(120);
  scene.add(sun);
  scene.add(sun.target);

  // A directional light shadows the whole scene, which would need an enormous
  // map. Instead the shadow camera is a tight box that follows the car, so a
  // 1024px map covers the street you are actually on at useful resolution.
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadows.mapSize, shadows.mapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -shadows.extent;
  sun.shadow.camera.right = shadows.extent;
  sun.shadow.camera.top = shadows.extent;
  sun.shadow.camera.bottom = -shadows.extent;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.04;

  const hemi = new THREE.HemisphereLight(new THREE.Color(settings.hemiSky),
                                         new THREE.Color(settings.hemiGround),
                                         settings.hemiIntensity);
  scene.add(hemi);
  return { sun, hemi };
}

/** Keep the shadow box centred on the action. */
export function followSun(sun, x, z) {
  if (!sun) return;
  sun.target.position.set(x, 0, z);
  sun.target.updateMatrixWorld();
  sun.position.set(x + SUN_DIRECTION.x * 120,
                   SUN_DIRECTION.y * 120,
                   z + SUN_DIRECTION.z * 120);
}

/**
 * Mark what takes part in the shadow pass.
 *
 * `mode` is 'cast', 'receive' or 'both'. Anything left unmarked is skipped by
 * the shadow pass entirely, which is how the cost is kept down: the road and
 * pavements only receive, the scenery only casts.
 */
export function shadowRole(object, mode) {
  const cast = mode === 'cast' || mode === 'both';
  const receive = mode === 'receive' || mode === 'both';
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = cast;
    node.receiveShadow = receive;
  });
  return object;
}

let shadowTexture = null;
const blobs = [];
let blobsEnabled = true;

/**
 * Show or hide every blob shadow at once. They are the stand-in for real
 * shadows, so when the shadow pass is on they would just double up.
 */
export function setBlobShadows(enabled) {
  blobsEnabled = enabled;
  for (const blob of blobs) blob.visible = enabled;
}

/** A soft dark ellipse that grounds a vehicle without a real shadow pass. */
export function makeShadow(width, length, opacity = 0.42) {
  if (!shadowTexture) shadowTexture = makeShadowTexture();
  const material = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity,
    depthWrite: false,
    color: 0x000000,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.5, length * 1.15), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = -1;
  mesh.visible = blobsEnabled;
  blobs.push(mesh);
  return mesh;
}

function makeSkyTexture(settings) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0.00, settings.top);
  gradient.addColorStop(0.42, settings.top);
  gradient.addColorStop(0.50, settings.horizon);
  gradient.addColorStop(0.56, settings.horizon);
  gradient.addColorStop(1.00, settings.ground);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

let beamTex = null;

/** Soft round falloff, reused for the headlight pool on the road. */
export function beamTexture() {
  if (beamTex) return beamTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  beamTex = new THREE.CanvasTexture(canvas);
  beamTex.needsUpdate = true;
  return beamTex;
}

function makeShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
