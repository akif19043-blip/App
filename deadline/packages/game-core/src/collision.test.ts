import { describe, expect, it } from 'vitest';
import { SECTOR_ZERO } from '@deadline/shared';
import { CollisionWorld, findClearPosition } from './collision.js';

const world = new CollisionWorld(SECTOR_ZERO);

describe('finding clear ground', () => {
  it('leaves an already-clear point alone', () => {
    const spawn = SECTOR_ZERO.playerSpawns[0]!.position;
    const found = findClearPosition(world, spawn.x, spawn.z);
    expect(found.x).toBeCloseTo(spawn.x, 5);
    expect(found.z).toBeCloseTo(spawn.z, 5);
  });

  it('moves a point out of a building onto walkable ground', () => {
    const building = SECTOR_ZERO.obstacles.find((obstacle) => obstacle.kind === 'building')!;
    const insideX = (building.box.minX + building.box.maxX) / 2;
    const insideZ = (building.box.minZ + building.box.maxZ) / 2;
    expect(world.isInsideSolid(insideX, 1, insideZ)).toBe(true);

    const found = findClearPosition(world, insideX, insideZ);
    expect(world.isInsideSolid(found.x, 1, found.z)).toBe(false);
    // It should stay in the same part of the map, not teleport across it.
    expect(Math.hypot(found.x - insideX, found.z - insideZ)).toBeLessThan(30);
  });

  it('keeps every district centre reachable', () => {
    // District centres are where the supply drop and the debug teleport aim.
    for (const poi of SECTOR_ZERO.pois) {
      const found = findClearPosition(world, poi.center.x, poi.center.z);
      expect(
        world.isInsideSolid(found.x, 1, found.z),
        `${poi.id} resolved into geometry`,
      ).toBe(false);
    }
  });

  it('stays inside the map bounds', () => {
    const edge = SECTOR_ZERO.halfSize - 1;
    const found = findClearPosition(world, edge, edge);
    expect(Math.abs(found.x)).toBeLessThanOrEqual(SECTOR_ZERO.halfSize);
    expect(Math.abs(found.z)).toBeLessThanOrEqual(SECTOR_ZERO.halfSize);
  });
});
