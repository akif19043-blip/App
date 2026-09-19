import type { AABB, MapDefinition, Obstacle, Vec3 } from '@deadline/shared';

/**
 * Static collision world.
 *
 * The map is a flat list of axis-aligned boxes; a uniform grid indexes them so
 * that movement and hitscan queries stay O(cells) instead of O(obstacles).
 * The *same* class runs inside the client predictor and the authoritative
 * server, which is what keeps prediction and reconciliation in agreement.
 */
export class CollisionWorld {
  readonly halfSize: number;
  private readonly cellSize: number;
  private readonly gridWidth: number;
  private readonly cells: Obstacle[][];
  readonly obstacles: readonly Obstacle[];

  constructor(map: MapDefinition, cellSize = 16) {
    this.halfSize = map.halfSize;
    this.cellSize = cellSize;
    this.obstacles = map.obstacles;
    this.gridWidth = Math.ceil((map.halfSize * 2 + cellSize * 2) / cellSize);
    this.cells = Array.from({ length: this.gridWidth * this.gridWidth }, () => []);
    for (const obstacle of map.obstacles) {
      this.insert(obstacle);
    }
  }

  private cellIndex(x: number, z: number): number {
    const gx = Math.floor((x + this.halfSize + this.cellSize) / this.cellSize);
    const gz = Math.floor((z + this.halfSize + this.cellSize) / this.cellSize);
    const cx = Math.min(this.gridWidth - 1, Math.max(0, gx));
    const cz = Math.min(this.gridWidth - 1, Math.max(0, gz));
    return cz * this.gridWidth + cx;
  }

  private insert(obstacle: Obstacle): void {
    const { box } = obstacle;
    const step = this.cellSize;
    for (let x = box.minX; x <= box.maxX + step; x += step) {
      for (let z = box.minZ; z <= box.maxZ + step; z += step) {
        const cell = this.cells[this.cellIndex(Math.min(x, box.maxX), Math.min(z, box.maxZ))];
        if (cell && !cell.includes(obstacle)) cell.push(obstacle);
      }
    }
  }

  /** Obstacles whose cells overlap the given circle. */
  query(x: number, z: number, radius: number): readonly Obstacle[] {
    const found: Obstacle[] = [];
    const step = this.cellSize;
    for (let ox = x - radius - step; ox <= x + radius + step; ox += step) {
      for (let oz = z - radius - step; oz <= z + radius + step; oz += step) {
        const cell = this.cells[this.cellIndex(ox, oz)];
        if (!cell) continue;
        for (const obstacle of cell) {
          if (!found.includes(obstacle)) found.push(obstacle);
        }
      }
    }
    return found;
  }

  /**
   * Resolve a capsule (approximated as a vertical cylinder) against the static
   * world. Returns the corrected position. Resolution is iterative and picks
   * the smallest penetration axis, which is stable for box worlds.
   */
  resolveCircle(
    x: number,
    z: number,
    radius: number,
    feetY: number,
    height: number,
  ): { x: number; z: number } {
    let px = x;
    let pz = z;
    const candidates = this.query(px, pz, radius + 1);
    for (let iteration = 0; iteration < 4; iteration += 1) {
      let corrected = false;
      for (const obstacle of candidates) {
        const box = obstacle.box;
        // The player can walk over anything shorter than a step height.
        if (box.maxY <= feetY + 0.35) continue;
        if (box.minY >= feetY + height) continue;
        const closestX = Math.max(box.minX, Math.min(px, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
        const dx = px - closestX;
        const dz = pz - closestZ;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= radius * radius) continue;

        if (distanceSq > 1e-8) {
          const distance = Math.sqrt(distanceSq);
          const push = radius - distance;
          px += (dx / distance) * push;
          pz += (dz / distance) * push;
        } else {
          // Centre is inside the box: push out along the shallowest axis.
          const toLeft = px - box.minX;
          const toRight = box.maxX - px;
          const toBack = pz - box.minZ;
          const toFront = box.maxZ - pz;
          const minPen = Math.min(toLeft, toRight, toBack, toFront);
          if (minPen === toLeft) px = box.minX - radius;
          else if (minPen === toRight) px = box.maxX + radius;
          else if (minPen === toBack) pz = box.minZ - radius;
          else pz = box.maxZ + radius;
        }
        corrected = true;
      }
      if (!corrected) break;
    }

    const limit = this.halfSize - radius;
    px = Math.max(-limit, Math.min(limit, px));
    pz = Math.max(-limit, Math.min(limit, pz));
    return { x: px, z: pz };
  }

  /** True when the point is inside any solid obstacle. */
  isInsideSolid(x: number, y: number, z: number): boolean {
    for (const obstacle of this.query(x, z, 0.1)) {
      const box = obstacle.box;
      if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ && y > box.minY && y < box.maxY) {
        return true;
      }
    }
    return false;
  }

  /**
   * Slab-method ray/AABB sweep across the static world.
   * Returns the nearest hit distance, or `null` when the ray reaches `maxDistance`.
   */
  raycast(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    options: { sightOnly?: boolean } = {},
  ): { distance: number; obstacle: Obstacle } | null {
    let nearest: { distance: number; obstacle: Obstacle } | null = null;
    // Query along the ray rather than around the origin so long shots are cheap
    // but still complete.
    const step = this.cellSize;
    const steps = Math.ceil(maxDistance / step) + 1;
    const visited = new Set<Obstacle>();
    for (let i = 0; i <= steps; i += 1) {
      const t = Math.min(maxDistance, i * step);
      const sx = origin.x + direction.x * t;
      const sz = origin.z + direction.z * t;
      for (const obstacle of this.query(sx, sz, step)) {
        if (visited.has(obstacle)) continue;
        visited.add(obstacle);
        if (options.sightOnly && !obstacle.blocksSight) continue;
        const hit = rayAabb(origin, direction, obstacle.box, maxDistance);
        if (hit !== null && (nearest === null || hit < nearest.distance)) {
          nearest = { distance: hit, obstacle };
        }
      }
      if (nearest !== null && nearest.distance <= t) break;
    }
    return nearest;
  }

  /** True when nothing solid blocks the straight line between two points. */
  hasLineOfSight(from: Vec3, to: Vec3): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-4) return true;
    const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
    const hit = this.raycast(from, direction, distance, { sightOnly: true });
    return hit === null || hit.distance >= distance - 1e-3;
  }
}

/** Ray/AABB intersection. Returns the entry distance or null. */
export function rayAabb(
  origin: Vec3,
  direction: Vec3,
  box: AABB,
  maxDistance: number,
): number | null {
  let tMin = 0;
  let tMax = maxDistance;

  const axes: readonly (readonly [number, number, number, number])[] = [
    [origin.x, direction.x, box.minX, box.maxX],
    [origin.y, direction.y, box.minY, box.maxY],
    [origin.z, direction.z, box.minZ, box.maxZ],
  ];

  for (const [start, delta, min, max] of axes) {
    if (Math.abs(delta) < 1e-8) {
      if (start < min || start > max) return null;
      continue;
    }
    const inverse = 1 / delta;
    let t1 = (min - start) * inverse;
    let t2 = (max - start) * inverse;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Ray/vertical-cylinder intersection, used for player and AI hitboxes. */
export function rayCylinder(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
  height: number,
  maxDistance: number,
): number | null {
  const ox = origin.x - center.x;
  const oz = origin.z - center.z;
  const a = direction.x * direction.x + direction.z * direction.z;
  if (a < 1e-8) return null;
  const b = 2 * (ox * direction.x + oz * direction.z);
  const c = ox * ox + oz * oz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const sqrtD = Math.sqrt(discriminant);
  const candidates = [(-b - sqrtD) / (2 * a), (-b + sqrtD) / (2 * a)];
  for (const t of candidates) {
    if (t < 0 || t > maxDistance) continue;
    const y = origin.y + direction.y * t;
    if (y < center.y || y > center.y + height) continue;
    return t;
  }
  return null;
}
