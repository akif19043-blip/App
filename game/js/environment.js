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
};

export function preset(name) {
  return TIME_OF_DAY[name] || TIME_OF_DAY.dusk;
}

export function applySky(scene, renderer, settings, fogRange) {
  const texture = makeSkyTexture(settings);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(texture).texture;

  scene.background = texture;
  scene.environment = environment;
  const near = fogRange ? fogRange[0] : settings.fogNear;
  const far = fogRange ? fogRange[1] : settings.fogFar;
  scene.fog = new THREE.Fog(new THREE.Color(settings.horizon), near, far);

  pmrem.dispose();
  return { texture, environment };
}

export function applyLights(scene, settings) {
  const sun = new THREE.DirectionalLight(new THREE.Color(settings.sun),
                                         settings.sunIntensity);
  // High and behind the default camera heading, so the cars the player looks
  // at are lit rather than silhouetted.
  sun.position.set(48, 92, 62);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(new THREE.Color(settings.hemiSky),
                                         new THREE.Color(settings.hemiGround),
                                         settings.hemiIntensity);
  scene.add(hemi);
  return { sun, hemi };
}

let shadowTexture = null;

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
