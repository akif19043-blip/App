import * as THREE from 'three';
import type { MapDefinition, Obstacle, PointOfInterest } from '@deadline/shared';

/**
 * Builds the Sector Zero scene from the shared map definition.
 *
 * Geometry is deliberately primitive — the map is a set of boxes — but it is
 * the *same* set of boxes the server collides against, so what you see is what
 * you can walk into. Buildings and cover are drawn with instanced meshes so the
 * whole district is a handful of draw calls.
 *
 * Replacing the placeholder look later means swapping the materials and
 * dropping real models into /public/game/models; nothing else has to change.
 */
export interface WorldScene {
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;
  readonly rain: RainSystem;
  readonly extractionRings: THREE.Mesh[];
  update(elapsed: number, cameraPosition: THREE.Vector3): void;
  dispose(): void;
}

export interface RainSystem {
  /** LineSegments of short vertical streaks, re-centred on the camera. */
  readonly points: THREE.Object3D;
  update(dt: number, center: THREE.Vector3): void;
  /** 0..1 fraction of the particle budget to draw, for the quality tiers. */
  setDensity(density: number): void;
}

const BUILDING_COLOR = new THREE.Color('#5c6880');
const COVER_COLOR = new THREE.Color('#6a7488');
const PROP_COLOR = new THREE.Color('#7c8598');
const WALL_COLOR = new THREE.Color('#39414f');

export function buildWorldScene(map: MapDefinition): WorldScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#33445f');
  // Blue-hour haze. The fog colour matches the sky's horizon band so the
  // ground plane dissolves into the sky instead of ending on a hard seam.
  scene.fog = new THREE.FogExp2(new THREE.Color('#33445f').getHex(), 0.0038);
  scene.add(buildSkyDome());

  // ---- lighting ---------------------------------------------------------
  // Overcast sky dome does most of the work; the "sun" is really the moon
  // behind cloud, and only exists to cast readable shadows.
  const hemisphere = new THREE.HemisphereLight(0x7f97bd, 0x1b222d, 2.1);
  scene.add(hemisphere);

  scene.add(new THREE.AmbientLight(0x4d5a72, 0.75));

  const sun = new THREE.DirectionalLight(0xbcd0ee, 1.45);
  sun.position.set(-90, 130, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // ---- ground -----------------------------------------------------------
  // Well beyond the playable area: the fog, not a visible seam, ends the world.
  const groundSize = map.halfSize * 6;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize, 1, 1),
    // Wet asphalt: dark but not black, with enough sheen to catch the lights.
    new THREE.MeshStandardMaterial({ color: '#232a36', roughness: 0.62, metalness: 0.12 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // A faint grid reads as road markings and gives the eye a sense of scale.
  // Road markings only inside the playable area.
  const gridSize = map.halfSize * 2;
  const grid = new THREE.GridHelper(gridSize, Math.round(gridSize / 10), 0x3d4a5e, 0x2c3543);
  grid.position.y = 0.02;
  (grid.material as THREE.Material).opacity = 0.5;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  // ---- obstacles --------------------------------------------------------
  const groups = groupObstacles(map.obstacles);
  for (const [kind, obstacles] of groups) {
    const mesh = buildInstancedBoxes(obstacles, colorFor(kind));
    mesh.castShadow = kind !== 'wall';
    mesh.receiveShadow = true;
    mesh.name = `obstacles_${kind}`;
    scene.add(mesh);
  }

  // ---- points of interest ----------------------------------------------
  for (const poi of map.pois) {
    scene.add(buildPoiMarker(poi));
  }

  // ---- extraction zones -------------------------------------------------
  const extractionRings: THREE.Mesh[] = [];
  for (const point of map.extractions) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(point.radius - 0.6, point.radius, 48),
      new THREE.MeshBasicMaterial({
        color: '#34D399',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(point.position.x, 0.06, point.position.z);
    ring.userData['extractionId'] = point.id;
    scene.add(ring);
    extractionRings.push(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(point.radius * 0.55, point.radius * 0.85, 34, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#34D399',
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.set(point.position.x, 17, point.position.z);
    scene.add(beam);
  }

  // ---- industrial lights ------------------------------------------------
  for (const poi of map.pois) {
    const lamp = new THREE.PointLight(
      poi.risk === 'very_high' ? 0xff4438 : 0xffb020,
      poi.risk === 'low' ? 55 : 90,
      120,
      2,
    );
    lamp.position.set(poi.center.x, 14, poi.center.z);
    scene.add(lamp);
  }

  const rain = buildRain();
  scene.add(rain.points);

  return {
    scene,
    sun,
    rain,
    extractionRings,
    update(elapsed, cameraPosition) {
      rain.update(1 / 60, cameraPosition);
      skyFollow(scene, cameraPosition);
      const pulse = 0.4 + Math.sin(elapsed * 2.4) * 0.22;
      for (const ring of extractionRings) {
        (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
      // Keep the shadow frustum centred on the player.
      sun.position.set(cameraPosition.x - 90, 130, cameraPosition.z + 60);
      sun.target.position.set(cameraPosition.x, 0, cameraPosition.z);
      sun.target.updateMatrixWorld();
    },
    dispose() {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose?.();
      });
      scene.clear();
    },
  };
}

function colorFor(kind: Obstacle['kind']): THREE.Color {
  switch (kind) {
    case 'wall':
      return WALL_COLOR;
    case 'cover':
      return COVER_COLOR;
    case 'prop':
      return PROP_COLOR;
    default:
      return BUILDING_COLOR;
  }
}

function groupObstacles(obstacles: readonly Obstacle[]): Map<Obstacle['kind'], Obstacle[]> {
  const groups = new Map<Obstacle['kind'], Obstacle[]>();
  for (const obstacle of obstacles) {
    const list = groups.get(obstacle.kind);
    if (list) list.push(obstacle);
    else groups.set(obstacle.kind, [obstacle]);
  }
  return groups;
}

function buildInstancedBoxes(obstacles: readonly Obstacle[], base: THREE.Color): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.08,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, obstacles.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  obstacles.forEach((obstacle, index) => {
    const { box } = obstacle;
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    const depth = box.maxZ - box.minZ;
    matrix.compose(
      new THREE.Vector3(
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        (box.minZ + box.maxZ) / 2,
      ),
      new THREE.Quaternion(),
      new THREE.Vector3(width, height, depth),
    );
    mesh.setMatrixAt(index, matrix);
    // Vary the tint slightly so identical boxes do not read as a single mass.
    const jitter = ((index * 2654435761) % 1000) / 1000;
    color.copy(base).offsetHSL(0, 0, (jitter - 0.5) * 0.08);
    mesh.setColorAt(index, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildPoiMarker(poi: PointOfInterest): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(poi.radius - 1.2, poi.radius, 64),
    new THREE.MeshBasicMaterial({
      color: poi.tint,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(poi.center.x, 0.04, poi.center.z);
  marker.name = `poi_${poi.id}`;
  return marker;
}

const RAIN_COUNT = 2600;
const RAIN_AREA = 70;
const RAIN_HEIGHT = 34;

/**
 * Rain drawn as short vertical streaks in a box that follows the camera.
 *
 * Particles are stored *relative to the box*, and the box is moved to the
 * camera every frame — so the player always stands in the middle of the
 * weather instead of leaving it behind at the world origin.
 */
function buildRain(): RainSystem {
  const positions = new Float32Array(RAIN_COUNT * 2 * 3);
  const speeds = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i += 1) {
    const x = (Math.random() - 0.5) * RAIN_AREA;
    const y = Math.random() * RAIN_HEIGHT;
    const z = (Math.random() - 0.5) * RAIN_AREA;
    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y + 0.55;
    positions[i * 6 + 5] = z;
    speeds[i] = 26 + Math.random() * 18;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const streaks = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x9fb4d4,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      fog: false,
    }),
  );
  streaks.frustumCulled = false;

  geometry.setDrawRange(0, RAIN_COUNT * 2);

  return {
    points: streaks,
    setDensity(density) {
      const visible = Math.max(1, Math.floor(RAIN_COUNT * Math.max(0, Math.min(1, density))));
      geometry.setDrawRange(0, visible * 2);
    },
    update(dt, center) {
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      const data = attribute.array as Float32Array;
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        const bottom = i * 6 + 1;
        const top = i * 6 + 4;
        const fall = (speeds[i] ?? 30) * dt;
        let y = (data[bottom] ?? 0) - fall;
        if (y < 0) {
          // Recycle to the top with a fresh horizontal position.
          const x = (Math.random() - 0.5) * RAIN_AREA;
          const z = (Math.random() - 0.5) * RAIN_AREA;
          y = RAIN_HEIGHT;
          data[i * 6] = x;
          data[i * 6 + 2] = z;
          data[i * 6 + 3] = x;
          data[i * 6 + 5] = z;
        }
        data[bottom] = y;
        data[top] = y + 0.55;
      }
      attribute.needsUpdate = true;
      streaks.position.set(center.x, 0, center.z);
    },
  };
}

/**
 * Gradient sky dome. A plain background colour makes the horizon read as a
 * hard seam; this keeps the far distance sitting behind the fog.
 */
function buildSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(900, 24, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#141f36') },
      horizonColor: { value: new THREE.Color('#33445f') },
      groundColor: { value: new THREE.Color('#1c2532') },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        // A slow falloff keeps the horizon band wide, so looking up a little
        // does not drop straight to night-black.
        vec3 color = h > 0.0
          ? mix(horizonColor, topColor, clamp(pow(h, 1.35), 0.0, 1.0))
          : mix(horizonColor, groundColor, clamp(-h * 4.0, 0.0, 1.0));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'sky_dome';
  dome.renderOrder = -1;
  return dome;
}

/** Keeps the sky centred on the camera so it never clips the far plane. */
function skyFollow(scene: THREE.Scene, cameraPosition: THREE.Vector3): void {
  const dome = scene.getObjectByName('sky_dome');
  if (dome) dome.position.set(cameraPosition.x, 0, cameraPosition.z);
}
