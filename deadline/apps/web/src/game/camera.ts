import * as THREE from 'three';
import { MOVEMENT } from '@deadline/shared';

/**
 * Third-person, over-the-shoulder camera.
 *
 * The camera sits behind and to the right of the character and pulls in when
 * geometry would clip it — a raycast from the player's head toward the desired
 * camera position decides how far back it may actually sit.
 */
export interface CameraRigOptions {
  /** Objects the camera must not pass through. */
  collidables: THREE.Object3D[];
}

// x = shoulder offset (character sits left of centre), y = camera height,
// z = distance behind the character.
const HIP_OFFSET = new THREE.Vector3(0.95, 1.72, 5.1);
const ADS_OFFSET = new THREE.Vector3(0.6, 1.66, 2.1);

/** Minimum distance the camera may sit from the character's head. */
const MIN_CAMERA_DISTANCE = 1.35;
/** Below this the character is faded out so it stops filling the screen. */
export const AVATAR_FADE_DISTANCE = 2.4;
/** Clearance kept between the camera and whatever it hit. */
const WALL_MARGIN = 0.38;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly collidables: THREE.Object3D[];
  private currentOffset = HIP_OFFSET.clone();
  private smoothedPosition = new THREE.Vector3();
  private smoothedDistance = HIP_OFFSET.z;
  private initialised = false;

  /** How far the camera currently sits from the character's head. */
  get distance(): number {
    return this.smoothedDistance;
  }

  /**
   * 0 when the camera is pressed right up against the character (hide it),
   * 1 once it is far enough back to draw normally.
   */
  get avatarOpacity(): number {
    const span = AVATAR_FADE_DISTANCE - MIN_CAMERA_DISTANCE;
    const t = (this.smoothedDistance - MIN_CAMERA_DISTANCE) / Math.max(0.01, span);
    return Math.max(0, Math.min(1, t));
  }

  constructor(aspect: number, options: CameraRigOptions) {
    this.camera = new THREE.PerspectiveCamera(74, aspect, 0.05, 900);
    this.collidables = options.collidables;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Position the camera for this frame.
   * @param target feet position of the player
   * @param yaw look yaw in radians
   * @param pitch look pitch in radians
   * @param ads whether the player is aiming down sights
   * @param shake camera shake offset
   */
  update(
    target: THREE.Vector3,
    yaw: number,
    pitch: number,
    ads: boolean,
    shake: THREE.Vector3,
    dt: number,
  ): void {
    const desiredOffset = ads ? ADS_OFFSET : HIP_OFFSET;
    this.currentOffset.lerp(desiredOffset, Math.min(1, dt * 11));
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, ads ? 56 : 74, Math.min(1, dt * 9));
    this.camera.updateProjectionMatrix();

    const head = new THREE.Vector3(target.x, target.y + MOVEMENT.eyeHeight, target.z);

    // Offset is expressed in the player's frame: right, up, back.
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const pitchDrop = Math.sin(pitch) * this.currentOffset.z;
    const desired = head
      .clone()
      .add(right.clone().multiplyScalar(this.currentOffset.x))
      .add(back.clone().multiplyScalar(this.currentOffset.z * Math.cos(pitch)))
      .add(new THREE.Vector3(0, this.currentOffset.y - MOVEMENT.eyeHeight - pitchDrop, 0));

    // Pull in if the world is in the way.
    //
    // A single ray through the centre is not enough: the camera has volume, and
    // a thin wall edge slipping past the middle ray is what puts the lens
    // inside a building. Five rays — the centre plus the corners of a small
    // box — approximate a sphere cast cheaply, and the nearest hit wins.
    const direction = desired.clone().sub(head);
    const distance = direction.length();
    let allowed = distance;

    if (distance > 0.01) {
      direction.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(direction, up).normalize();
      const lift = new THREE.Vector3().crossVectors(side, direction).normalize();
      const probe = 0.32;
      const offsets = [
        new THREE.Vector3(),
        side.clone().multiplyScalar(probe),
        side.clone().multiplyScalar(-probe),
        lift.clone().multiplyScalar(probe),
        lift.clone().multiplyScalar(-probe),
      ];

      for (const offset of offsets) {
        this.raycaster.set(head.clone().add(offset), direction);
        this.raycaster.far = distance + WALL_MARGIN;
        const hit = this.raycaster.intersectObjects(this.collidables, false)[0];
        if (hit) allowed = Math.min(allowed, hit.distance - WALL_MARGIN);
      }
      allowed = Math.max(MIN_CAMERA_DISTANCE, allowed);

      // Snap in immediately when something blocks the view, but ease back out
      // so leaving cover does not whip the camera.
      this.smoothedDistance =
        allowed < this.smoothedDistance
          ? allowed
          : THREE.MathUtils.lerp(this.smoothedDistance, allowed, Math.min(1, dt * 6));

      desired.copy(head).add(direction.clone().multiplyScalar(this.smoothedDistance));
    }

    if (!this.initialised) {
      this.smoothedPosition.copy(desired);
      this.initialised = true;
    } else {
      this.smoothedPosition.lerp(desired, Math.min(1, dt * 18));
    }

    this.camera.position.copy(this.smoothedPosition).add(shake);

    const lookAt = head
      .clone()
      .add(
        new THREE.Vector3(
          -Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          -Math.cos(yaw) * Math.cos(pitch),
        ).multiplyScalar(18),
      );
    this.camera.lookAt(lookAt);
  }

  /** World-space aim ray used for the crosshair and muzzle position. */
  aimDirection(yaw: number, pitch: number): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
  }
}
