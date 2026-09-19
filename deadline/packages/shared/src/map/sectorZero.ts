import { AIArchetype, ContainerType, RiskLevel } from '../enums.js';
import { boxFromFootprint, distance2D, type AABB, type Vec3 } from '../math.js';
import { hashString, makeRng, type Rng } from '../rng.js';
import type {
  AISpawnPoint,
  ExtractionPoint,
  LockedRoom,
  LootSpawnPoint,
  MapDefinition,
  Obstacle,
  PlayerSpawnPoint,
  PointOfInterest,
  SupplyDropZone,
} from './types.js';

/**
 * SECTOR ZERO — the first DEADLINE map.
 *
 * The layout is *generated deterministically* from a fixed seed rather than
 * hand-placing several hundred boxes: POI blueprints below describe the shape
 * of each district, and the generator lays out buildings, cover, loot slots and
 * AI posts from them. The seed is baked in, so every client and the server
 * build byte-identical geometry and collision stays in sync.
 *
 * Replacing this with authored/exported geometry later only requires producing
 * the same `MapDefinition` shape.
 */

const MAP_SEED = hashString('sector_zero:v1');
const HALF_SIZE = 200;

interface PoiBlueprint {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly center: { x: number; z: number };
  readonly radius: number;
  readonly risk: RiskLevel;
  readonly tint: string;
  readonly buildingSize: readonly [min: number, max: number];
  readonly buildingHeight: readonly [min: number, max: number];
  readonly lootSlots: number;
  /** Weighted container table for this district. */
  readonly containers: readonly (readonly [ContainerType, number])[];
  readonly ai: readonly (readonly [AIArchetype, number])[];
  readonly aiCount: number;
}

const POI_BLUEPRINTS: readonly PoiBlueprint[] = [
  {
    id: 'apartments',
    name: 'Apartment Blocks',
    description: 'Evacuated housing. Thin loot, thin risk — a decent place to start.',
    center: { x: -142, z: 18 },
    radius: 48,
    risk: RiskLevel.Low,
    tint: '#4b5563',
    buildingSize: [12, 21],
    buildingHeight: [10, 22],
    lootSlots: 14,
    containers: [
      [ContainerType.Cabinet, 40],
      [ContainerType.Locker, 30],
      [ContainerType.CivilianCrate, 25],
      [ContainerType.Vehicle, 5],
    ],
    ai: [
      [AIArchetype.Scavenger, 85],
      [AIArchetype.Guard, 15],
    ],
    aiCount: 4,
  },
  {
    id: 'train_station',
    name: 'Train Station',
    description: 'Collapsed platforms and freight containers. Sightlines everywhere.',
    center: { x: -122, z: -132 },
    radius: 50,
    risk: RiskLevel.Medium,
    tint: '#6b7280',
    buildingSize: [14, 30],
    buildingHeight: [8, 16],
    lootSlots: 13,
    containers: [
      [ContainerType.CivilianCrate, 35],
      [ContainerType.Locker, 25],
      [ContainerType.Vehicle, 20],
      [ContainerType.MilitaryCrate, 15],
      [ContainerType.HiddenCache, 5],
    ],
    ai: [
      [AIArchetype.Scavenger, 60],
      [AIArchetype.Guard, 40],
    ],
    aiCount: 5,
  },
  {
    id: 'hospital',
    name: 'Old Hospital',
    description: 'Quarantine triage centre. Medical supplies, and whatever guards them.',
    center: { x: 124, z: -128 },
    radius: 44,
    risk: RiskLevel.Medium,
    tint: '#0ea5a0',
    buildingSize: [15, 27],
    buildingHeight: [12, 26],
    lootSlots: 13,
    containers: [
      [ContainerType.MedicalCabinet, 55],
      [ContainerType.Cabinet, 20],
      [ContainerType.Locker, 15],
      [ContainerType.MilitaryCrate, 10],
    ],
    ai: [
      [AIArchetype.Scavenger, 45],
      [AIArchetype.Guard, 50],
      [AIArchetype.Heavy, 5],
    ],
    aiCount: 5,
  },
  {
    id: 'market_street',
    name: 'Market Street',
    description: 'The centre of the sector. Everyone crosses it; nobody owns it.',
    center: { x: 4, z: -18 },
    radius: 56,
    risk: RiskLevel.Medium,
    tint: '#f59e0b',
    buildingSize: [9, 19],
    buildingHeight: [7, 18],
    lootSlots: 16,
    containers: [
      [ContainerType.CivilianCrate, 34],
      [ContainerType.Cabinet, 24],
      [ContainerType.Vehicle, 22],
      [ContainerType.Locker, 12],
      [ContainerType.MilitaryCrate, 8],
    ],
    ai: [
      [AIArchetype.Scavenger, 62],
      [AIArchetype.Guard, 35],
      [AIArchetype.Heavy, 3],
    ],
    aiCount: 6,
  },
  {
    id: 'police_station',
    name: 'Police Station',
    description: 'Weapons and armour — behind a locked armoury door.',
    center: { x: -96, z: 122 },
    radius: 40,
    risk: RiskLevel.High,
    tint: '#3b82f6',
    buildingSize: [14, 26],
    buildingHeight: [10, 20],
    lootSlots: 11,
    containers: [
      [ContainerType.WeaponRack, 40],
      [ContainerType.Locker, 25],
      [ContainerType.MilitaryCrate, 25],
      [ContainerType.Vehicle, 10],
    ],
    ai: [
      [AIArchetype.Guard, 65],
      [AIArchetype.Heavy, 20],
      [AIArchetype.Scavenger, 15],
    ],
    aiCount: 6,
  },
  {
    id: 'warehouse',
    name: 'Warehouse District',
    description: 'Freight bays and stacked containers. Military crates, heavy company.',
    center: { x: 134, z: 96 },
    radius: 52,
    risk: RiskLevel.High,
    tint: '#ef4444',
    buildingSize: [17, 32],
    buildingHeight: [9, 18],
    lootSlots: 14,
    containers: [
      [ContainerType.MilitaryCrate, 42],
      [ContainerType.CivilianCrate, 22],
      [ContainerType.WeaponRack, 16],
      [ContainerType.Vehicle, 12],
      [ContainerType.HiddenCache, 8],
    ],
    ai: [
      [AIArchetype.Guard, 58],
      [AIArchetype.Heavy, 30],
      [AIArchetype.Scavenger, 12],
    ],
    aiCount: 7,
  },
  {
    id: 'bunker',
    name: 'Underground Bunker',
    description: 'Quarantine authority command. The best loot in Sector Zero, and the worst odds.',
    center: { x: 26, z: 162 },
    radius: 34,
    risk: RiskLevel.VeryHigh,
    tint: '#a855f7',
    buildingSize: [13, 24],
    buildingHeight: [6, 12],
    lootSlots: 10,
    containers: [
      [ContainerType.MilitaryCrate, 38],
      [ContainerType.HiddenCache, 34],
      [ContainerType.WeaponRack, 18],
      [ContainerType.Locker, 10],
    ],
    ai: [
      [AIArchetype.Heavy, 46],
      [AIArchetype.Guard, 48],
      [AIArchetype.Scavenger, 6],
    ],
    aiCount: 7,
  },
];

const EXTRACTION_POINTS: readonly ExtractionPoint[] = [
  { id: 'subway_exit', name: 'Subway Exit', position: { x: -176, z: -172, y: 0 }, radius: 7 },
  { id: 'warehouse_gate', name: 'Warehouse Gate', position: { x: 178, z: 158, y: 0 }, radius: 7 },
  { id: 'emergency_tunnel', name: 'Emergency Tunnel', position: { x: 172, z: -178, y: 0 }, radius: 7 },
];

const LOCKED_ROOMS: readonly LockedRoom[] = [
  {
    id: 'police_armory',
    name: 'Police Armory',
    keyItemId: 'key_police_armory',
    poiId: 'police_station',
    center: { x: -96, z: 122, y: 0 },
  },
  {
    id: 'bunker_vault',
    name: 'Bunker Vault',
    keyItemId: 'key_bunker_access',
    poiId: 'bunker',
    center: { x: 26, z: 162, y: 0 },
  },
];

function boxesOverlap(a: AABB, b: AABB, padding: number): boolean {
  return (
    a.minX - padding < b.maxX &&
    a.maxX + padding > b.minX &&
    a.minZ - padding < b.maxZ &&
    a.maxZ + padding > b.minZ
  );
}

function pointInsideAny(x: number, z: number, obstacles: readonly Obstacle[], padding: number): boolean {
  for (const obstacle of obstacles) {
    const { box } = obstacle;
    if (
      x > box.minX - padding &&
      x < box.maxX + padding &&
      z > box.minZ - padding &&
      z < box.maxZ + padding
    ) {
      return true;
    }
  }
  return false;
}

function buildBoundaryWalls(): Obstacle[] {
  const thickness = 6;
  const span = HALF_SIZE * 2 + thickness * 2;
  const height = 16;
  const edge = HALF_SIZE + thickness / 2;
  return [
    {
      id: 'wall_north',
      kind: 'wall',
      blocksSight: true,
      box: boxFromFootprint(0, edge, span, thickness, height),
    },
    {
      id: 'wall_south',
      kind: 'wall',
      blocksSight: true,
      box: boxFromFootprint(0, -edge, span, thickness, height),
    },
    {
      id: 'wall_east',
      kind: 'wall',
      blocksSight: true,
      box: boxFromFootprint(edge, 0, thickness, span, height),
    },
    {
      id: 'wall_west',
      kind: 'wall',
      blocksSight: true,
      box: boxFromFootprint(-edge, 0, thickness, span, height),
    },
  ];
}

/**
 * Lays the city out as a street grid.
 *
 * The district blueprints no longer place a handful of isolated boxes: the
 * whole map is divided into blocks separated by streets, and every block is
 * filled with buildings whose size and height come from whichever district it
 * falls in. That is what makes Sector Zero read as a city you fight through
 * rather than a field with props in it.
 */
function generateCityBlocks(rng: Rng, existing: Obstacle[]): Obstacle[] {
  const created: Obstacle[] = [];
  // One city block per grid cell, separated by drivable-width streets.
  const blockPitch = 34;
  const streetWidth = 12;
  const usable = blockPitch - streetWidth;
  const limit = HALF_SIZE - 12;

  for (let gx = -limit; gx <= limit - blockPitch; gx += blockPitch) {
    for (let gz = -limit; gz <= limit - blockPitch; gz += blockPitch) {
      const blockCenterX = gx + blockPitch / 2;
      const blockCenterZ = gz + blockPitch / 2;

      // Extraction zones need open ground around them.
      if (
        EXTRACTION_POINTS.some(
          (point) =>
            distance2D({ x: blockCenterX, z: blockCenterZ }, point.position) <
            point.radius + blockPitch * 0.6,
        )
      ) {
        continue;
      }

      const district = nearestDistrict(blockCenterX, blockCenterZ);
      // Occasional empty lot keeps sightlines varied.
      if (rng.bool(0.1)) continue;

      // The main structure fills most of the block; a smaller annex beside it
      // breaks up the silhouette and creates the alleys people fight in.
      const parts: { scale: number; chance: number }[] = [
        { scale: 1, chance: 1 },
        { scale: 0.52, chance: 0.55 },
      ];

      for (const part of parts) {
        if (!rng.bool(part.chance)) continue;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const maxSide = usable * (part.scale === 1 ? 0.92 : 0.5);
          const width = Math.min(
            maxSide,
            rng.float(district.buildingSize[0], district.buildingSize[1]) * part.scale,
          );
          const depth = Math.min(
            maxSide,
            rng.float(district.buildingSize[0], district.buildingSize[1]) * part.scale,
          );
          const height =
            rng.float(district.buildingHeight[0], district.buildingHeight[1]) *
            (part.scale === 1 ? 1 : rng.float(0.45, 0.8));
          const halfSpan = Math.max(0, usable / 2 - Math.max(width, depth) / 2);
          const cx = blockCenterX + rng.float(-halfSpan, halfSpan);
          const cz = blockCenterZ + rng.float(-halfSpan, halfSpan);
          const box = boxFromFootprint(cx, cz, width, depth, Math.max(4, height));

          if (Math.abs(cx) + width / 2 > HALF_SIZE - 8) continue;
          if (Math.abs(cz) + depth / 2 > HALF_SIZE - 8) continue;
          if (created.some((other) => boxesOverlap(box, other.box, 2.5))) continue;
          if (existing.some((other) => boxesOverlap(box, other.box, 2.5))) continue;

          created.push({
            id: `bld_${created.length}`,
            kind: 'building',
            blocksSight: true,
            box,
            poiId: district.id,
          });
          break;
        }
      }
    }
  }
  return created;
}

/**
 * District whose footprint a point falls in, or a generic city profile when it
 * falls between districts.
 */
function nearestDistrict(x: number, z: number): {
  id: string;
  buildingSize: readonly [number, number];
  buildingHeight: readonly [number, number];
} {
  let best: PoiBlueprint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const blueprint of POI_BLUEPRINTS) {
    const distance = distance2D({ x, z }, { x: blueprint.center.x, z: blueprint.center.z });
    if (distance < blueprint.radius * 1.25 && distance < bestDistance) {
      bestDistance = distance;
      best = blueprint;
    }
  }
  if (best) {
    return {
      id: best.id,
      buildingSize: best.buildingSize,
      buildingHeight: best.buildingHeight,
    };
  }
  // Generic quarantine-zone housing between the named districts.
  return { id: 'streets', buildingSize: [11, 19], buildingHeight: [8, 20] };
}

function generateStreetCover(rng: Rng, existing: Obstacle[]): Obstacle[] {
  const created: Obstacle[] = [];
  const target = 220;
  for (let attempt = 0; attempt < target * 12 && created.length < target; attempt += 1) {
    const cx = rng.float(-HALF_SIZE + 12, HALF_SIZE - 12);
    const cz = rng.float(-HALF_SIZE + 12, HALF_SIZE - 12);
    const long = rng.bool(0.45);
    const width = long ? rng.float(5.6, 8.2) : rng.float(1.8, 3.4);
    const depth = long ? rng.float(2.2, 3) : rng.float(1.8, 3.4);
    const height = long ? rng.float(2.2, 2.9) : rng.float(1.1, 2.4);
    const box = boxFromFootprint(cx, cz, width, depth, height);
    if (created.some((other) => boxesOverlap(box, other.box, 3.5))) continue;
    if (existing.some((other) => boxesOverlap(box, other.box, 2.5))) continue;
    // Keep extraction zones clear so the extract prompt is always reachable.
    if (EXTRACTION_POINTS.some((point) => distance2D({ x: cx, z: cz }, point.position) < point.radius + 6)) {
      continue;
    }
    created.push({
      id: `cover_${created.length}`,
      kind: long ? 'cover' : 'prop',
      blocksSight: height > 1.7,
      box,
    });
  }
  return created;
}

function generateLootSpawns(
  rng: Rng,
  blueprint: PoiBlueprint,
  obstacles: readonly Obstacle[],
): LootSpawnPoint[] {
  const spawns: LootSpawnPoint[] = [];
  const lockedRoom = LOCKED_ROOMS.find((room) => room.poiId === blueprint.id);
  for (let attempt = 0; attempt < blueprint.lootSlots * 40 && spawns.length < blueprint.lootSlots; attempt += 1) {
    const angle = rng.float(0, Math.PI * 2);
    const radius = Math.sqrt(rng.next()) * blueprint.radius;
    const x = blueprint.center.x + Math.cos(angle) * radius;
    const z = blueprint.center.z + Math.sin(angle) * radius;
    if (Math.abs(x) > HALF_SIZE - 4 || Math.abs(z) > HALF_SIZE - 4) continue;
    if (pointInsideAny(x, z, obstacles, 1.4)) continue;
    if (spawns.some((other) => distance2D({ x, z }, other.position) < 7)) continue;
    const containerType = rng.weighted(blueprint.containers);
    spawns.push({
      id: `${blueprint.id}_loot_${spawns.length}`,
      position: { x, y: 0, z },
      rotationY: rng.float(0, Math.PI * 2),
      containerType,
      poiId: blueprint.id,
    });
  }
  // Two key-gated caches sit in the district's locked room.
  if (lockedRoom) {
    for (let i = 0; i < 2; i += 1) {
      const offsetAngle = rng.float(0, Math.PI * 2);
      spawns.push({
        id: `${blueprint.id}_vault_${i}`,
        position: {
          x: lockedRoom.center.x + Math.cos(offsetAngle) * 3.2,
          y: 0,
          z: lockedRoom.center.z + Math.sin(offsetAngle) * 3.2,
        },
        rotationY: rng.float(0, Math.PI * 2),
        containerType: ContainerType.HiddenCache,
        poiId: blueprint.id,
        lockedRoomId: lockedRoom.id,
      });
    }
  }
  return spawns;
}

function generateAISpawns(
  rng: Rng,
  blueprint: PoiBlueprint,
  obstacles: readonly Obstacle[],
): AISpawnPoint[] {
  const spawns: AISpawnPoint[] = [];
  for (let attempt = 0; attempt < blueprint.aiCount * 40 && spawns.length < blueprint.aiCount; attempt += 1) {
    const angle = rng.float(0, Math.PI * 2);
    const radius = Math.sqrt(rng.next()) * blueprint.radius;
    const x = blueprint.center.x + Math.cos(angle) * radius;
    const z = blueprint.center.z + Math.sin(angle) * radius;
    if (Math.abs(x) > HALF_SIZE - 6 || Math.abs(z) > HALF_SIZE - 6) continue;
    if (pointInsideAny(x, z, obstacles, 2)) continue;
    if (spawns.some((other) => distance2D({ x, z }, other.position) < 10)) continue;
    spawns.push({
      id: `${blueprint.id}_ai_${spawns.length}`,
      position: { x, y: 0, z },
      archetype: rng.weighted(blueprint.ai),
      poiId: blueprint.id,
      patrolRadius: rng.float(11, 24),
    });
  }
  return spawns;
}

function generatePlayerSpawns(obstacles: readonly Obstacle[]): PlayerSpawnPoint[] {
  const spawns: PlayerSpawnPoint[] = [];
  // Two concentric rings near the map edge. Deploying on the perimeter keeps
  // players away from each other and from the high-value centre.
  // Far enough from the quarantine wall that a fresh operator is not staring
  // at a blank slab, close enough to the edge that nobody spawns on the loot.
  const rings: readonly (readonly [radius: number, count: number, offset: number])[] = [
    [HALF_SIZE - 42, 20, 0],
    [HALF_SIZE - 72, 16, Math.PI / 16],
  ];
  for (const [ringRadius, count, offset] of rings) {
    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i / count) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius;
      if (pointInsideAny(x, z, obstacles, 2.4)) continue;
      spawns.push({
        id: `spawn_${spawns.length}`,
        position: { x, y: 0, z },
        // Face the middle of the map.
        rotationY: Math.atan2(-x, -z),
      });
    }
  }
  return spawns;
}

function buildMap(): MapDefinition {
  const rng = makeRng(MAP_SEED);
  const obstacles: Obstacle[] = buildBoundaryWalls();

  obstacles.push(...generateCityBlocks(rng, obstacles));
  obstacles.push(...generateStreetCover(rng, obstacles));

  const lootSpawns: LootSpawnPoint[] = [];
  const aiSpawns: AISpawnPoint[] = [];
  for (const blueprint of POI_BLUEPRINTS) {
    lootSpawns.push(...generateLootSpawns(rng, blueprint, obstacles));
    aiSpawns.push(...generateAISpawns(rng, blueprint, obstacles));
  }

  const pois: PointOfInterest[] = POI_BLUEPRINTS.map((blueprint) => ({
    id: blueprint.id,
    name: blueprint.name,
    description: blueprint.description,
    center: { x: blueprint.center.x, y: 0, z: blueprint.center.z } satisfies Vec3,
    radius: blueprint.radius,
    risk: blueprint.risk,
    tint: blueprint.tint,
  }));

  const supplyDropZones: SupplyDropZone[] = POI_BLUEPRINTS.filter(
    (blueprint) => blueprint.risk !== RiskLevel.Low,
  ).map((blueprint) => ({
    id: `drop_${blueprint.id}`,
    poiId: blueprint.id,
    position: { x: blueprint.center.x, y: 0, z: blueprint.center.z },
  }));

  return {
    id: 'sector_zero',
    name: 'Sector Zero',
    tagline: 'Quarantined industrial quarter. Nine minutes of daylight left.',
    halfSize: HALF_SIZE,
    obstacles,
    pois,
    extractions: EXTRACTION_POINTS,
    lootSpawns,
    aiSpawns,
    playerSpawns: generatePlayerSpawns(obstacles),
    lockedRooms: LOCKED_ROOMS,
    supplyDropZones,
  };
}

/** The single, immutable Sector Zero definition. */
export const SECTOR_ZERO: MapDefinition = buildMap();

export const MAPS: Readonly<Record<string, MapDefinition>> = {
  [SECTOR_ZERO.id]: SECTOR_ZERO,
};

export function getMap(id: string): MapDefinition | undefined {
  return MAPS[id];
}
