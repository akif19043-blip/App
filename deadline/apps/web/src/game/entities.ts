import * as THREE from 'three';
import { MOVEMENT, lerpAngle } from '@deadline/shared';
import { rarityColor } from '@deadline/ui';

/**
 * Visual entities and snapshot interpolation.
 *
 * The server broadcasts at 20 Hz; the client renders at 60. Remote players and
 * AI are therefore drawn ~100 ms in the past, interpolated between the two
 * snapshots that bracket the render time. That is what makes other people move
 * smoothly instead of teleporting once per network tick.
 */
const INTERPOLATION_DELAY_MS = 100;
const BUFFER_LENGTH = 24;

interface Snapshot {
  t: number;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface EntityVisual {
  readonly group: THREE.Group;
  readonly buffer: Snapshot[];
  alive: boolean;
  lastSeen: number;
}

export class EntityPool {
  private readonly scene: THREE.Scene;
  private readonly visuals = new Map<string, EntityVisual>();
  private readonly playerMaterial: THREE.MeshStandardMaterial;
  private readonly enemyMaterials: Record<string, THREE.MeshStandardMaterial>;
  private readonly bodyGeometry: THREE.CapsuleGeometry;
  private readonly headGeometry: THREE.SphereGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.playerMaterial = new THREE.MeshStandardMaterial({
      color: '#4d5f7a',
      roughness: 0.7,
      metalness: 0.15,
    });
    this.enemyMaterials = {
      scavenger: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.8 }),
      guard: new THREE.MeshStandardMaterial({ color: '#8c5a3c', roughness: 0.75 }),
      heavy: new THREE.MeshStandardMaterial({ color: '#7f2d2d', roughness: 0.6, metalness: 0.3 }),
    };
    this.bodyGeometry = new THREE.CapsuleGeometry(
      MOVEMENT.playerRadius,
      MOVEMENT.playerHeight - MOVEMENT.playerRadius * 2,
      6,
      12,
    );
    this.headGeometry = new THREE.SphereGeometry(0.19, 12, 10);
  }

  /** Record a network snapshot for an entity, creating its visual on demand. */
  push(
    id: string,
    kind: 'player' | 'ai',
    data: { x: number; y: number; z: number; rotationY: number; alive: boolean; archetype?: string },
  ): void {
    let visual = this.visuals.get(id);
    if (!visual) {
      visual = this.create(id, kind, data.archetype);
      this.visuals.set(id, visual);
    }
    visual.alive = data.alive;
    visual.lastSeen = performance.now();
    visual.group.visible = data.alive;
    visual.buffer.push({
      t: performance.now(),
      x: data.x,
      y: data.y,
      z: data.z,
      rotationY: data.rotationY,
    });
    if (visual.buffer.length > BUFFER_LENGTH) visual.buffer.shift();
  }

  /** Advance every entity to the interpolated render time. */
  update(now: number): void {
    const renderTime = now - INTERPOLATION_DELAY_MS;
    for (const [id, visual] of this.visuals) {
      if (now - visual.lastSeen > 15_000) {
        this.remove(id);
        continue;
      }
      const sample = sampleBuffer(visual.buffer, renderTime);
      if (!sample) continue;
      visual.group.position.set(sample.x, sample.y, sample.z);
      visual.group.rotation.y = sample.rotationY;
    }
  }

  has(id: string): boolean {
    return this.visuals.has(id);
  }

  positionOf(id: string): THREE.Vector3 | null {
    return this.visuals.get(id)?.group.position ?? null;
  }

  remove(id: string): void {
    const visual = this.visuals.get(id);
    if (!visual) return;
    this.scene.remove(visual.group);
    this.visuals.delete(id);
  }

  clear(): void {
    for (const id of [...this.visuals.keys()]) this.remove(id);
  }

  private create(id: string, kind: 'player' | 'ai', archetype?: string): EntityVisual {
    const group = new THREE.Group();
    group.name = id;

    const material =
      kind === 'ai'
        ? (this.enemyMaterials[archetype ?? 'scavenger'] ?? this.enemyMaterials['scavenger']!)
        : this.playerMaterial;

    const body = new THREE.Mesh(this.bodyGeometry, material);
    body.position.y = MOVEMENT.playerHeight / 2;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(this.headGeometry, material);
    head.position.y = MOVEMENT.playerHeight - 0.12;
    head.castShadow = true;
    group.add(head);

    // A small forward spike reads as "which way is this thing facing".
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.55),
      new THREE.MeshStandardMaterial({ color: kind === 'ai' ? '#FF4438' : '#9fb4d6' }),
    );
    nose.position.set(0.16, MOVEMENT.playerHeight * 0.62, -0.45);
    group.add(nose);

    this.scene.add(group);
    return { group, buffer: [], alive: true, lastSeen: performance.now() };
  }
}

function sampleBuffer(buffer: Snapshot[], renderTime: number): Snapshot | null {
  if (buffer.length === 0) return null;
  if (buffer.length === 1) return buffer[0]!;

  for (let i = buffer.length - 1; i > 0; i -= 1) {
    const next = buffer[i]!;
    const previous = buffer[i - 1]!;
    if (previous.t <= renderTime && renderTime <= next.t) {
      const span = next.t - previous.t;
      const alpha = span <= 0 ? 1 : (renderTime - previous.t) / span;
      return {
        t: renderTime,
        x: previous.x + (next.x - previous.x) * alpha,
        y: previous.y + (next.y - previous.y) * alpha,
        z: previous.z + (next.z - previous.z) * alpha,
        rotationY: lerpAngle(previous.rotationY, next.rotationY, alpha),
      };
    }
  }
  // Render time is ahead of the newest snapshot: hold the last known pose.
  return buffer[buffer.length - 1]!;
}

/**
 * Container visuals. Containers rarely change, so they get a simple mesh each
 * rather than an interpolation buffer.
 */
export class ContainerPool {
  private readonly scene: THREE.Scene;
  private readonly meshes = new Map<string, THREE.Group>();
  private readonly geometry = new THREE.BoxGeometry(0.85, 0.7, 0.6);
  private readonly beamGeometry = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  sync(
    id: string,
    data: {
      x: number;
      y: number;
      z: number;
      rotationY: number;
      containerType: string;
      opened: boolean;
      empty: boolean;
      locked: boolean;
    },
  ): void {
    let group = this.meshes.get(id);
    if (!group) {
      group = this.create(id, data.containerType, data.locked);
      this.meshes.set(id, group);
      this.scene.add(group);
    }
    group.position.set(data.x, data.y + 0.35, data.z);
    group.rotation.y = data.rotationY;

    const crate = group.children[0] as THREE.Mesh | undefined;
    if (crate) {
      const material = crate.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = data.empty ? 0 : data.opened ? 0.25 : 0.75;
    }
    const beam = group.children[1];
    if (beam) beam.visible = !data.empty;
  }

  remove(id: string): void {
    const group = this.meshes.get(id);
    if (!group) return;
    this.scene.remove(group);
    this.meshes.delete(id);
  }

  clear(): void {
    for (const id of [...this.meshes.keys()]) this.remove(id);
  }

  private create(id: string, containerType: string, locked: boolean): THREE.Group {
    const group = new THREE.Group();
    group.name = `container_${id}`;
    const tint = containerTint(containerType, locked);

    const crate = new THREE.Mesh(
      containerType === 'corpse' ? new THREE.BoxGeometry(1.4, 0.4, 0.6) : this.geometry,
      new THREE.MeshStandardMaterial({
        color: tint,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.75,
        roughness: 0.65,
        metalness: 0.25,
      }),
    );
    crate.castShadow = true;
    group.add(crate);

    // Rarity beam: a soft vertical shaft so loot reads at distance.
    const beam = new THREE.Mesh(
      this.beamGeometry,
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    beam.position.y = 1.4;
    group.add(beam);

    return group;
  }
}

function containerTint(containerType: string, locked: boolean): string {
  if (locked) return rarityColor('legendary');
  switch (containerType) {
    case 'military_crate':
      return rarityColor('rare');
    case 'weapon_rack':
      return rarityColor('rare');
    case 'hidden_cache':
      return rarityColor('epic');
    case 'supply_drop':
      return rarityColor('legendary');
    case 'medical_cabinet':
      return '#0ea5a0';
    case 'corpse':
      return '#7a5353';
    default:
      return rarityColor('common');
  }
}
