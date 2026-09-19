import type { AIArchetype, ContainerType, RiskLevel } from '../enums.js';
import type { AABB, Vec3 } from '../math.js';

/** A static, axis-aligned collider. Both client prediction and the server
 * simulation resolve against exactly this list, so movement stays in sync. */
export interface Obstacle {
  readonly id: string;
  readonly kind: 'building' | 'wall' | 'cover' | 'container' | 'prop';
  readonly box: AABB;
  /** Whether hitscan / line-of-sight is blocked by this obstacle. */
  readonly blocksSight: boolean;
  /** Optional POI this obstacle belongs to, for debug and minimap tinting. */
  readonly poiId?: string;
}

export interface PointOfInterest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly center: Vec3;
  readonly radius: number;
  readonly risk: RiskLevel;
  /** Relative colour hint used by the minimap / deploy screen. */
  readonly tint: string;
}

export interface ExtractionPoint {
  readonly id: string;
  readonly name: string;
  readonly position: Vec3;
  readonly radius: number;
}

export interface LootSpawnPoint {
  readonly id: string;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly containerType: ContainerType;
  readonly poiId: string;
  /** When set, the container may only be opened while holding the room's key. */
  readonly lockedRoomId?: string;
}

export interface AISpawnPoint {
  readonly id: string;
  readonly position: Vec3;
  readonly archetype: AIArchetype;
  readonly poiId: string;
  readonly patrolRadius: number;
}

export interface PlayerSpawnPoint {
  readonly id: string;
  readonly position: Vec3;
  readonly rotationY: number;
}

export interface LockedRoom {
  readonly id: string;
  readonly name: string;
  readonly keyItemId: string;
  readonly poiId: string;
  readonly center: Vec3;
}

export interface SupplyDropZone {
  readonly id: string;
  readonly position: Vec3;
  readonly poiId: string;
}

export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  /** Half-extent of the square playable area in metres. */
  readonly halfSize: number;
  readonly obstacles: readonly Obstacle[];
  readonly pois: readonly PointOfInterest[];
  readonly extractions: readonly ExtractionPoint[];
  readonly lootSpawns: readonly LootSpawnPoint[];
  readonly aiSpawns: readonly AISpawnPoint[];
  readonly playerSpawns: readonly PlayerSpawnPoint[];
  readonly lockedRooms: readonly LockedRoom[];
  readonly supplyDropZones: readonly SupplyDropZone[];
}
