import * as THREE from 'three';

/**
 * Game feel: tracers, muzzle flashes, impact sparks and camera shake.
 *
 * Everything is pooled — no allocation in the render loop — and each effect has
 * a hard lifetime so a busy firefight cannot grow the scene graph.
 */
const TRACER_POOL = 48;
const IMPACT_POOL = 32;

interface PooledTracer {
  line: THREE.Line;
  until: number;
}

interface PooledImpact {
  sprite: THREE.Mesh;
  until: number;
}

export class EffectsSystem {
  private readonly scene: THREE.Scene;
  private readonly tracers: PooledTracer[] = [];
  private readonly impacts: PooledImpact[] = [];
  private tracerCursor = 0;
  private impactCursor = 0;

  private readonly muzzleFlash: THREE.PointLight;
  private muzzleUntil = 0;

  private shakeAmplitude = 0;
  private shakeDecay = 6;
  /** Extra camera pitch/yaw from weapon recoil, decayed every frame. */
  private recoilPitch = 0;
  private recoilYaw = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const tracerMaterial = new THREE.LineBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < TRACER_POOL; i += 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const line = new THREE.Line(geometry, tracerMaterial.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, until: 0 });
    }

    const impactGeometry = new THREE.SphereGeometry(0.09, 6, 5);
    for (let i = 0; i < IMPACT_POOL; i += 1) {
      const sprite = new THREE.Mesh(
        impactGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9 }),
      );
      sprite.visible = false;
      scene.add(sprite);
      this.impacts.push({ sprite, until: 0 });
    }

    this.muzzleFlash = new THREE.PointLight(0xffb060, 0, 14, 2);
    scene.add(this.muzzleFlash);
  }

  /** Draw a bullet trace and its impact. */
  spawnTracer(from: THREE.Vector3, to: THREE.Vector3, hit: boolean): void {
    const tracer = this.tracers[this.tracerCursor % this.tracers.length]!;
    this.tracerCursor += 1;
    const positions = tracer.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    tracer.line.visible = true;
    tracer.until = performance.now() + 70;

    const impact = this.impacts[this.impactCursor % this.impacts.length]!;
    this.impactCursor += 1;
    impact.sprite.position.copy(to);
    impact.sprite.visible = true;
    (impact.sprite.material as THREE.MeshBasicMaterial).color.set(hit ? 0xff6b5a : 0xbfc9d6);
    impact.until = performance.now() + 140;
  }

  spawnMuzzleFlash(position: THREE.Vector3): void {
    this.muzzleFlash.position.copy(position);
    this.muzzleFlash.intensity = 22;
    this.muzzleUntil = performance.now() + 55;
  }

  addShake(amount: number): void {
    this.shakeAmplitude = Math.min(0.5, this.shakeAmplitude + amount);
  }

  /** Apply weapon recoil to the aim angles; returns the new angles. */
  addRecoil(pitchDegrees: number, yawDegrees: number): void {
    this.recoilPitch += (pitchDegrees * Math.PI) / 180;
    this.recoilYaw += (yawDegrees * Math.PI) / 180;
    this.addShake(0.045 + pitchDegrees * 0.01);
  }

  /**
   * Consume the pending recoil for this frame. The camera adds the returned
   * deltas to the player's aim, then the recoil decays back toward zero — so
   * the shot climbs and then settles, rather than permanently shifting aim.
   */
  consumeRecoil(dt: number, recoverySpeed: number): { pitch: number; yaw: number } {
    const recovery = Math.min(1, recoverySpeed * dt);
    const pitch = this.recoilPitch * recovery;
    const yaw = this.recoilYaw * recovery;
    this.recoilPitch -= pitch;
    this.recoilYaw -= yaw;
    return { pitch, yaw };
  }

  /** Per-frame bookkeeping; returns the camera shake offset for this frame. */
  update(dt: number): THREE.Vector3 {
    const now = performance.now();
    for (const tracer of this.tracers) {
      if (tracer.line.visible && now > tracer.until) tracer.line.visible = false;
    }
    for (const impact of this.impacts) {
      if (impact.sprite.visible && now > impact.until) impact.sprite.visible = false;
    }
    if (this.muzzleFlash.intensity > 0 && now > this.muzzleUntil) {
      this.muzzleFlash.intensity = 0;
    }

    this.shakeAmplitude = Math.max(0, this.shakeAmplitude - this.shakeDecay * dt * this.shakeAmplitude);
    if (this.shakeAmplitude < 0.0015) {
      this.shakeAmplitude = 0;
      return new THREE.Vector3();
    }
    return new THREE.Vector3(
      (Math.random() - 0.5) * this.shakeAmplitude,
      (Math.random() - 0.5) * this.shakeAmplitude,
      (Math.random() - 0.5) * this.shakeAmplitude * 0.4,
    );
  }
}
