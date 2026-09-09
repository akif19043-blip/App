/**
 * Tuning constants for the whole game.
 *
 * Anything a designer would want to nudge lives here; nothing in this file
 * touches three.js. Road geometry is NOT duplicated here -- it is read from
 * assets/models/manifest.json, which Blender writes when it builds the road,
 * so the lanes the traffic drives in are the lanes that were modelled.
 */

export const WORLD = {
  drawDistance: 280,          // metres of road kept alive ahead of the player
  behindDistance: 70,         // metres kept alive behind before recycling
  rebaseAt: 12000,            // shift everything back to origin past this, for
                              // float precision on very long runs
  gravity: 9.81,
};

export const PLAY = {
  startSpeed: 18,             // m/s the run begins at
  brakeDecel: 26,             // m/s^2 under braking
  coastDecel: 5,              // m/s^2 with no throttle
  steerBase: 7.4,             // m/s of lateral movement at low speed
  steerAtTopSpeed: 0.42,      // steering scale once at top speed
  steerLerp: 9.0,             // how fast steering input ramps in/out
  bodyRollMax: 0.10,          // radians the body leans while cornering
  wheelTurnMax: 0.42,         // radians the front wheels visibly turn
  scrapeDecel: 16,            // penalty for grinding along the guardrail
  nitroFactor: 1.25,          // top-speed multiplier while boosting
  nitroDuration: 3.2,         // seconds per activation
  nitroPerPickup: 0.5,        // fraction of the bar a canister fills
  collisionShrink: 0.82,      // AABBs are tighter than the art, so near
                              // misses feel like near misses
};

export const SCORE = {
  perMetre: 1,
  overtake: 12,
  nearMiss: 30,
  nearMissDistance: 1.35,     // metres of clearance that counts as "close"
  speedBonusFrom: 28,         // m/s above which score gains a multiplier
  coinValue: 1,
};

export const TRAFFIC = {
  minCars: 6,
  maxCars: 16,
  spawnAhead: 185,            // far enough to react to at top speed,
  spawnSpread: 110,           // near enough that the first pack arrives fast
  gapMin: 26,                 // never spawn closer than this in one lane
  speedRange: [17, 31],       // m/s for cars
  heavySpeedRange: [15, 22],  // m/s for trucks and buses
  heavyChance: 0.22,
  densityRampMetres: 4000,    // distance over which it reaches max difficulty
};

export const PICKUPS = {
  coinRunLength: [4, 8],
  coinSpacing: 9,
  coinHeight: 1.0,
  coinChancePerSpawn: 0.75,
  nitroChancePerSpawn: 0.22,
  nitroHeight: 0.9,
  spawnIntervalMetres: 120,
  spawnAhead: 200,            // where a fresh run of coins is laid down
  radius: 2.2,
};

export const SCENERY = {
  sideMin: 8.4,
  sideMax: 62,
  spacing: 28,                // average metres between roadside props
  lampSpacing: 72,
  mesaChance: 0.14,
};

export const CAMERA = {
  distance: 8.4,
  height: 3.5,
  lookAhead: 14,
  lookHeight: 1.1,
  lerp: 5.5,
  fovPortrait: 68,
  fovLandscape: 56,
  speedFovBoost: 12,          // extra degrees of FOV at top speed
};

/** Free-roam handling. The highway mode does not use these. */
export const DRIVE = {
  maxSteerAngle: 0.55,        // radians of front-wheel lock at low speed
  steerAtSpeed: 0.30,         // fraction of that lock left at high speed
  steerLerp: 9.0,
  bodyRoll: 0.55,             // lean multiplier, times steer times speed
  reverseAccel: 6.0,
  reverseTopSpeed: 9.0,
  cameraDistance: 8.6,
  cameraHeight: 4.3,          // a little high, so cross traffic is visible
  cameraLookAhead: 10,
  cameraLookHeight: 1.2,
  cameraLerp: 4.2,
  cameraTurnLead: 0.35,       // how far the camera swings toward the turn
};

/** City map: what lives on the streets. */
export const CITY = {
  trafficCars: 22,
  trafficSpeed: [11, 19],     // m/s -- town speeds, not motorway speeds
  trafficKeepRadius: 300,     // respawn once this far from the player
  trafficSpawnRadius: [55, 190],
  coins: 150,
  coinHeight: 1.0,
  pickupRadius: 3.0,
  lampsAtIntersections: true,
  missionPay: [140, 380],
  missionArriveRadius: 7.0,
  fogRange: [90, 420],
};

/**
 * Playable cars. `model` is the Blender asset name; `paint` recolours the
 * shared CarPaint material at load time.
 */
export const CARS = [
  {
    id: 'sport',
    model: 'car_sport',
    name: 'Kavalye GT',
    tagline: 'Dengeli ve affedici',
    paint: '#d33a2c',
    price: 0,
    topSpeed: 61,
    accel: 9.6,
    handling: 1.0,
  },
  {
    id: 'muscle',
    model: 'car_muscle',
    name: 'Bozkurt V8',
    tagline: 'Ağır ama düz yolda uçar',
    paint: '#2f6bd8',
    price: 3500,
    topSpeed: 71,
    accel: 11.8,
    handling: 0.8,
  },
  {
    id: 'super',
    model: 'car_super',
    name: 'Şimşek SR',
    tagline: 'Çok hızlı, çok keskin',
    paint: '#f0b429',
    price: 12000,
    topSpeed: 78,
    accel: 15.2,
    handling: 1.24,
  },
];

/** Traffic paint colours, picked at random per spawned car. */
export const TRAFFIC_COLORS = [
  '#c9d1d9', '#4a5560', '#8d99a6', '#2f4858', '#b4472e',
  '#3f7d5a', '#d8b24a', '#7b4a8c', '#2b6ca3', '#e0e4e8',
];

export const TRAFFIC_MODELS = {
  light: ['traffic_sedan', 'traffic_hatch', 'traffic_suv'],
  heavy: ['traffic_truck', 'traffic_bus'],
};
