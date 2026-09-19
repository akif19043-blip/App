import { SECTOR_ZERO, type MapDefinition, type Vec3 } from '@deadline/shared';
import { CollisionWorld } from '../collision.js';
import { directionFromAngles } from '../combat.js';

/**
 * Test helper: find genuinely open ground on a generated map.
 *
 * Sector Zero is generated, so hardcoding "somewhere in the open" makes tests
 * brittle the moment the layout changes. This scans for a spot with a clear
 * firing lane and clear space to walk, and fails loudly if the map has none.
 */
export interface OpenLane {
  /** Feet position of a clear standing spot. */
  readonly position: Vec3;
  /** Yaw with `length` metres of unobstructed line ahead. */
  readonly yaw: number;
  readonly length: number;
}

const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];

export function findOpenLane(
  length = 26,
  map: MapDefinition = SECTOR_ZERO,
  world = new CollisionWorld(map),
): OpenLane {
  const step = 6;
  const bound = map.halfSize - 20;

  for (let x = -bound; x <= bound; x += step) {
    for (let z = -bound; z <= bound; z += step) {
      // The spot itself must be walkable with clearance on every side.
      if (world.isInsideSolid(x, 1, z)) continue;
      const blocked = world.query(x, z, 2.2).some((obstacle) => {
        const box = obstacle.box;
        return (
          x > box.minX - 2.2 &&
          x < box.maxX + 2.2 &&
          z > box.minZ - 2.2 &&
          z < box.maxZ + 2.2 &&
          box.maxY > 0.4
        );
      });
      if (blocked) continue;

      for (const yaw of YAWS) {
        const origin = { x, y: 1.55, z };
        const hit = world.raycast(origin, directionFromAngles(yaw, 0), length);
        if (hit === null) {
          return { position: { x, y: 0, z }, yaw, length };
        }
      }
    }
  }

  throw new Error(`no open lane of ${length}m found on map ${map.id}`);
}
