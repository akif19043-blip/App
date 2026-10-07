/**
 * A low-poly humanoid built from boxes, with named pivots so it can be
 * animated: hips, both shoulders, both legs, the head. The runner and the
 * guard chasing them are both made here; only colours and the hat differ.
 */

import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);

function part(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/**
 * @param {object} look  { shirt, pants, skin, hair, hat, hatColor }
 * @returns {{ root, body, head, armL, armR, legL, legR, extras }}
 */
export function makeFigure(look) {
  const root = new THREE.Group();          // at the feet
  const body = new THREE.Group();          // rotates for lean / slide
  root.add(body);

  // legs hang from hip pivots
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.15, 0.95, 0);
  legR.position.set(0.15, 0.95, 0);
  for (const leg of [legL, legR]) {
    leg.add(part(0.24, 0.85, 0.26, look.pants, 0, -0.45, 0));
    leg.add(part(0.26, 0.14, 0.36, 0x1d1d22, 0, -0.9, 0.05));   // shoe
    body.add(leg);
  }

  body.add(part(0.58, 0.64, 0.32, look.shirt, 0, 1.27, 0));        // torso
  body.add(part(0.5, 0.1, 0.3, look.pants, 0, 0.98, 0));           // belt

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.38, 1.52, 0);
  armR.position.set(0.38, 1.52, 0);
  for (const arm of [armL, armR]) {
    arm.add(part(0.17, 0.58, 0.19, look.shirt, 0, -0.26, 0));
    arm.add(part(0.15, 0.14, 0.16, look.skin, 0, -0.6, 0));        // hand
    body.add(arm);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  head.add(part(0.36, 0.36, 0.36, look.skin, 0, 0.18, 0));
  head.add(part(0.38, 0.12, 0.38, look.hair, 0, 0.35, -0.01));     // hair cap
  // eyes, so the face reads from behind-and-above when he turns
  head.add(part(0.06, 0.06, 0.02, 0x111111, -0.09, 0.2, 0.185));
  head.add(part(0.06, 0.06, 0.02, 0x111111, 0.09, 0.2, 0.185));
  body.add(head);

  const extras = [];
  switch (look.hat) {
    case 'cap': {
      const cap = part(0.4, 0.12, 0.4, look.hatColor, 0, 0.4, 0);
      const brim = part(0.4, 0.04, 0.22, look.hatColor, 0, 0.36, 0.28);
      head.add(cap, brim);
      break;
    }
    case 'hood': {
      const hood = part(0.46, 0.46, 0.46, look.hatColor, 0, 0.2, -0.04);
      hood.material.transparent = false;
      head.add(hood);
      // keep the face visible: a darker slab in front
      head.add(part(0.3, 0.3, 0.02, look.skin, 0, 0.18, 0.2));
      break;
    }
    case 'antenna': {
      const rod = part(0.04, 0.3, 0.04, 0x777d88, 0, 0.5, 0);
      const bulb = part(0.1, 0.1, 0.1, look.hatColor, 0, 0.68, 0);
      head.add(rod, bulb);
      extras.push(bulb);
      break;
    }
    case 'mask': {
      head.add(part(0.38, 0.12, 0.38, look.hatColor, 0, 0.2, 0));
      head.add(part(0.1, 0.05, 0.3, look.hatColor, 0, 0.26, -0.3));   // knot tails
      break;
    }
    case 'helmet': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10),
        new THREE.MeshStandardMaterial({ color: look.hatColor, transparent: true, opacity: 0.45, roughness: 0.2, metalness: 0.3 }));
      dome.position.set(0, 0.2, 0);
      head.add(dome);
      break;
    }
    case 'fez': {
      const fez = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.22, 12),
        new THREE.MeshStandardMaterial({ color: look.hatColor, roughness: 0.8 }));
      fez.position.set(0, 0.47, 0);
      fez.castShadow = true;
      head.add(fez);
      head.add(part(0.03, 0.2, 0.03, 0x222222, 0.16, 0.4, -0.05));   // tassel
      break;
    }
    default:
      break;
  }

  return { root, body, head, armL, armR, legL, legR, extras };
}

/**
 * Pose a figure for one frame.
 * @param {object} fig       from makeFigure
 * @param {string} state     'run' | 'jump' | 'slide' | 'fall' | 'fly' | 'idle' | 'caught'
 * @param {number} phase     run-cycle angle (radians)
 * @param {number} lean      forward lean, radians
 */
export function poseFigure(fig, state, phase, lean = 0.12) {
  const s = Math.sin(phase);
  const { body, armL, armR, legL, legR, head } = fig;
  body.scale.set(1, 1, 1);
  body.position.y = 0;
  body.rotation.set(lean, 0, 0);
  head.rotation.set(0, 0, 0);
  switch (state) {
    case 'run':
      legL.rotation.x = s * 0.95;
      legR.rotation.x = -s * 0.95;
      armL.rotation.x = -s * 0.9;
      armR.rotation.x = s * 0.9;
      body.position.y = Math.abs(Math.cos(phase)) * 0.07;
      break;
    case 'jump':
      legL.rotation.x = 0.7;
      legR.rotation.x = -0.4;
      armL.rotation.x = -2.6;
      armR.rotation.x = -2.6;
      body.rotation.x = lean * 0.5;
      break;
    case 'fall':
      legL.rotation.x = -0.3;
      legR.rotation.x = 0.3;
      armL.rotation.x = -2.9;
      armR.rotation.x = -2.9;
      armL.rotation.z = 0.5;
      armR.rotation.z = -0.5;
      head.rotation.x = -0.4;
      break;
    case 'slide':
      body.scale.set(1, 0.55, 1);
      body.rotation.x = -0.35;
      legL.rotation.x = 0.9;
      legR.rotation.x = 0.9;
      armL.rotation.x = 1.0;
      armR.rotation.x = 1.0;
      break;
    case 'fly':
      body.rotation.x = 1.1;
      legL.rotation.x = -0.2 + s * 0.1;
      legR.rotation.x = -0.2 - s * 0.1;
      armL.rotation.x = -0.3;
      armR.rotation.x = -0.3;
      armL.rotation.z = 1.3;
      armR.rotation.z = -1.3;
      break;
    case 'caught':
      body.rotation.x = -0.2;
      legL.rotation.x = 0.1;
      legR.rotation.x = -0.1;
      armL.rotation.x = -2.8;
      armR.rotation.x = -2.8;
      armL.rotation.z = 0.3;
      armR.rotation.z = -0.3;
      head.rotation.y = Math.PI;
      break;
    default: // idle
      legL.rotation.x = 0;
      legR.rotation.x = 0;
      armL.rotation.x = Math.sin(phase * 0.3) * 0.05;
      armR.rotation.x = -Math.sin(phase * 0.3) * 0.05;
      armL.rotation.z = 0;
      armR.rotation.z = 0;
      body.rotation.x = 0;
      break;
  }
  if (state !== 'fall' && state !== 'fly' && state !== 'caught') {
    armL.rotation.z = 0;
    armR.rotation.z = 0;
  }
}
