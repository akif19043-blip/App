/** Minimal vector maths shared by the simulation, the AI and the renderer. */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned box in world space; `y` is the floor height of the box. */
export interface AABB {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export function boxFromFootprint(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  height: number,
  floorY = 0,
): AABB {
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: floorY,
    maxY: floorY + height,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed difference between two angles, in radians. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + angleDelta(from, to) * t;
}

export function distance2D(a: Vec2 | Vec3, b: Vec2 | Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function distanceSquared2D(a: Vec2 | Vec3, b: Vec2 | Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function distance3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function normalize2D(x: number, z: number): Vec2 {
  const length = Math.hypot(x, z);
  if (length < 1e-6) return { x: 0, z: 0 };
  return { x: x / length, z: z / length };
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Round to a fixed number of decimals — keeps network payloads compact. */
export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
