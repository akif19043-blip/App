/**
 * City-wide traffic signals.
 *
 * Every junction runs the same phase at the same time, which is what makes the
 * whole thing cheap: the six lamp materials (three per axis) are shared by
 * every signal post the loader produced, so switching the entire city's lights
 * is six `emissiveIntensity` writes per phase change, not one per post.
 *
 * It also makes the city readable to the player: whatever light you can see is
 * the light the cross traffic is obeying.
 */

const LIT = 6.0;
const DIM = 0.02;

/** One entry per phase: what each axis shows, and for how long. */
const CYCLE = [
  { x: 'Green', z: 'Red', duration: 7.0 },
  { x: 'Amber', z: 'Red', duration: 1.8 },
  { x: 'Red', z: 'Red', duration: 0.7 },
  { x: 'Red', z: 'Green', duration: 7.0 },
  { x: 'Red', z: 'Amber', duration: 1.8 },
  { x: 'Red', z: 'Red', duration: 0.7 },
];

const LAMPS = ['Red', 'Amber', 'Green'];

export class Signals {
  /** @param {THREE.Object3D} post any loaded traffic_light instance */
  constructor(post) {
    this.materials = { x: {}, z: {} };
    if (post) {
      post.traverse((node) => {
        if (!node.isMesh) return;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) {
          if (!material || !material.name) continue;
          const match = /^Signal([XZ])_(Red|Amber|Green)$/.exec(material.name);
          if (match) this.materials[match[1].toLowerCase()][match[2]] = material;
        }
      });
    }
    this.index = 0;
    this.elapsed = 0;
    this.apply();
  }

  get phase() {
    return CYCLE[this.index];
  }

  /** 'green' | 'amber' | 'red' for traffic travelling along `axis`. */
  stateFor(axis) {
    return this.phase[axis].toLowerCase();
  }

  isGreen(axis) {
    return this.phase[axis] === 'Green';
  }

  /** Seconds left in the current phase -- lets traffic judge an amber. */
  get remaining() {
    return this.phase.duration - this.elapsed;
  }

  update(dt) {
    this.elapsed += dt;
    if (this.elapsed < this.phase.duration) return false;
    this.elapsed -= this.phase.duration;
    this.index = (this.index + 1) % CYCLE.length;
    this.apply();
    return true;
  }

  apply() {
    for (const axis of ['x', 'z']) {
      for (const lamp of LAMPS) {
        const material = this.materials[axis][lamp];
        if (!material) continue;
        material.emissiveIntensity = this.phase[axis] === lamp ? LIT : DIM;
        material.needsUpdate = true;
      }
    }
  }

  /** Jump straight to a phase. Used by tests and when a run restarts. */
  set(index, elapsed = 0) {
    this.index = ((index % CYCLE.length) + CYCLE.length) % CYCLE.length;
    this.elapsed = elapsed;
    this.apply();
  }
}

export { CYCLE };
