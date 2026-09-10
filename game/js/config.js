/**
 * Tuning constants for the whole game.
 *
 * Anything a designer would want to nudge lives here; nothing in this file
 * touches three.js. Road geometry is NOT duplicated here -- it is read from
 * assets/models/manifest.json, which Blender writes when it builds the road,
 * so the lanes the traffic drives in are the lanes that were modelled.
 */

/** Sun shadows. Off on low-end devices via the settings toggle. */
export const SHADOWS = {
  mapSize: 1024,
  extent: 62,                 // half-size of the shadow box, in metres
};

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
  /**
   * Damage. `damageFloor` is the impact speed below which nothing registers
   * (kerbing a wheel while parking is not a crash); `damageScale` turns the
   * share of top speed that went into the hit into damage; `damagePerHit`
   * caps a single impact so one bad moment cannot write the car off; and
   * `damagePower` is how much of the top speed a fully wrecked car loses.
   */
  damageFloor: 5.5,           // m/s of impact before anything registers
  damageScale: 0.55,
  damagePerHit: 0.22,
  damagePower: 0.35,
  repairCost: 900,            // coins to put a fully wrecked car right
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
  fovLandscape: 50,
  landscapeRigScale: 0.88,    // chase distance/height multiplier in landscape
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
  reverseCameraLerp: 3.0,     // how fast it swings round when reversing
  squealFrom: 6.0,            // steerAngle * speed above which tyres protest
};

/** City map: what lives on the streets. */
export const CITY = {
  trafficCars: 26,
  trafficSpeed: [11, 19],     // m/s -- town speeds, not motorway speeds
  trafficKeepRadius: 300,     // respawn once this far from the player
  trafficSpawnRadius: [55, 190],
  coins: 240,          // a bigger map needs more strung along its streets
  coinHeight: 1.0,
  pickupRadius: 3.0,
  lampsAtIntersections: true,
  /**
   * Landmarks sit at fixed grid cells instead of being rolled like the rest.
   * A grid of interchangeable blocks all looks the same through a windscreen,
   * so three unmistakable buildings -- one north, one east, one south -- give
   * the player something to steer by without staring at the minimap.
   * `cell` is [i, j] into the grid; index = i * grid + j.
   */
  landmarks: [
    { kind: 'block_tower', cell: [3, 6] },
    { kind: 'block_stadium', cell: [6, 3] },
    { kind: 'block_plaza', cell: [3, 1] },
  ],
  minimapSpan: 230,           // metres across the zoomed-in minimap
  pedestrians: 16,            // people walking the pavements
  pedestrianRange: 150,       // metres from the player before they are moved
  missionPay: [140, 380],
  /**
   * Job types. `stops` is how many places you must reach, `pay` scales the
   * fee, and `pace` is the average speed the clock assumes -- a courier run
   * with four stops gets less slack per metre than a single drop.
   */
  missionTypes: [
    { id: 'delivery', stops: 1, pay: 1.0, pace: 15, weight: 5 },
    { id: 'passenger', stops: 2, pay: 1.5, pace: 15, weight: 3 },
    { id: 'courier', stops: 4, pay: 2.1, pace: 16, weight: 2 },
  ],
  missionPace: 15,            // m/s the time limit assumes you can average
  missionGrace: 18,           // seconds on top, for junctions and mistakes
  missionBonus: 0.6,          // fraction of the fee paid for beating the clock
  missionArriveRadius: 7.0,
  fogRange: [90, 420],
  /**
   * Heat and the patrol car it summons. Heat is 0..1; a full meter dispatches
   * a patrol, and it stays full until you lose them. The fine is a share of
   * what the run has earned, so being nicked costs you the afternoon rather
   * than the car -- a game that takes everything away is a game people stop
   * playing.
   */
  police: {
    speedLimit: 24,           // m/s (~86 km/h) before it counts as speeding
    heatPerCrash: 0.34,       // running into traffic
    heatPerScrape: 0.10,      // clouting a building
    heatWhileSpeeding: 0.085, // per second over the limit
    heatDecay: 0.05,          // per second of driving properly
    spawnRadius: [80, 140],
    chaseSpeed: 27,
    closeRange: 26,           // within this it stops driving lanes and closes
    catchRadius: 9,
    catchSpeed: 7,            // you are only nicked once you have slowed down
    catchTime: 1.6,
    loseRadius: 200,
    loseTime: 8,
    fine: 0.25,               // share of the run's earnings handed over
    minFine: 120,
  },
};

/**
 * Parts you can fit in the garage. `perLevel` is a fraction added to the base
 * stat per level, so a level-3 engine is +21% top speed.
 */
export const UPGRADES = [
  { id: 'engine', nameKey: 'part.engine', stat: 'topSpeed', perLevel: 0.07,
    levels: 3, basePrice: 900 },
  { id: 'gearbox', nameKey: 'part.gearbox', stat: 'accel', perLevel: 0.10,
    levels: 3, basePrice: 750 },
  { id: 'tyres', nameKey: 'part.tyres', stat: 'handling', perLevel: 0.08,
    levels: 3, basePrice: 650 },
  { id: 'brakes', nameKey: 'part.brakes', stat: 'brakeScale', perLevel: 0.10,
    levels: 3, basePrice: 500 },
];

/**
 * Driver ranks.
 *
 * Coins buy cars; rank is what the city thinks of you. It gates the harder
 * job types -- a four-stop courier run is not something you are handed on
 * your first afternoon -- and lifts the rate every job pays, so the same
 * delivery is worth more to a driver who has earned it. Cars stay on coins
 * alone: two currencies gating the same purchase is one too many.
 *
 * `xp` is the total needed to reach the rank. `job` is a job type it opens;
 * `payBonus` is added to the multiplier on every fee.
 */
export const RANKS = [
  { id: 1, xp: 0, nameKey: 'rank.1', payBonus: 0 },
  { id: 2, xp: 500, nameKey: 'rank.2', payBonus: 0.05, job: 'passenger' },
  { id: 3, xp: 1400, nameKey: 'rank.3', payBonus: 0.10 },
  { id: 4, xp: 2800, nameKey: 'rank.4', payBonus: 0.15, job: 'courier' },
  { id: 5, xp: 5000, nameKey: 'rank.5', payBonus: 0.20 },
  { id: 6, xp: 8200, nameKey: 'rank.6', payBonus: 0.26 },
  { id: 7, xp: 12500, nameKey: 'rank.7', payBonus: 0.32 },
  { id: 8, xp: 18000, nameKey: 'rank.8', payBonus: 0.40 },
];

/**
 * What earns experience. Deliveries are the bulk of it, distance is the slow
 * drip that rewards simply being out there, and the clean-driving bonus is
 * paid per job finished without a scratch -- the one number that makes the
 * careful line worth taking.
 */
export const XP = {
  perJob: 45,                 // times the number of stops
  onTime: 40,
  perKm: 10,
  perCoin: 1,
  cleanJob: 35,
};

/** Paints available in the garage. */
export const PAINTS = [
  '#d33a2c', '#2f6bd8', '#f0b429', '#2f9e5f', '#8a4fd0',
  '#e2571f', '#1fb6c9', '#e9edf2', '#22262c', '#b4126a',
];

/**
 * Playable cars.
 *
 * `payMultiplier` scales delivery fees, which is how the van earns its place:
 * it loses every race but pays best, so the choice is not simply "buy the
 * fastest one you can afford". `model` is the Blender asset name; `paint` recolours the
 * shared CarPaint material at load time.
 */
export const CARS = [
  {
    id: 'sport',
    model: 'car_sport',
    nameKey: 'car.sport',
    tagKey: 'car.sport.tag',
    paint: '#d33a2c',
    price: 0,
    topSpeed: 61,
    accel: 9.6,
    handling: 1.0,
  },
  {
    id: 'hatch',
    model: 'car_hatch',
    nameKey: 'car.hatch',
    tagKey: 'car.hatch.tag',
    paint: '#4bb3a0',
    price: 900,
    topSpeed: 52,
    accel: 8.4,
    handling: 1.12,
  },
  {
    id: 'muscle',
    model: 'car_muscle',
    nameKey: 'car.muscle',
    tagKey: 'car.muscle.tag',
    paint: '#2f6bd8',
    price: 3500,
    topSpeed: 71,
    accel: 11.8,
    handling: 0.8,
  },
  {
    id: 'van',
    model: 'car_van',
    nameKey: 'car.van',
    tagKey: 'car.van.tag',
    paint: '#e0e4e8',
    price: 5000,
    topSpeed: 48,
    accel: 7.0,
    handling: 0.72,
    payMultiplier: 1.35,
  },
  {
    id: 'super',
    model: 'car_super',
    nameKey: 'car.super',
    tagKey: 'car.super.tag',
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
