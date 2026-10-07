/**
 * Tuning constants for Sıçra. Everything that decides how the run *feels*
 * lives here so a balance pass never means hunting through gameplay code.
 *
 * Units: metres, seconds, metres per second. The player runs along +z;
 * lanes are spread along x; the roof surface is y = 0.
 */

// Lane 0 is screen-left. The camera looks along +z, so screen-left is +x.
export const LANES = [2.2, 0, -2.2];
export const LANE_WIDTH = 2.2;
export const LANE_SWITCH_TIME = 0.22;   // seconds to slide one lane over

export const PLAYER = {
  width: 0.7,          // collision box, x
  depth: 0.6,          // collision box, z
  height: 1.8,         // standing
  slideHeight: 0.85,   // crouched under a laundry line
  slideTime: 0.9,
  jumpSpeed: 7.4,      // apex ≈ 1.25 m, air time ≈ 0.67 s at the gravity below
  gravity: 22,
  fallDeath: -4,       // y below which a gap has swallowed you
  coyote: 0.12,        // seconds after an edge in which a jump still works
  ledge: 0.4,          // how far below a roof you can still clamber up
};

export const SPEED = {
  start: 10,
  max: 22,
  rampDistance: 2600,  // metres over which speed climbs from start to max
  wings: 1.25,         // multiplier while flying
};

export const ROOF = {
  halfWidth: 4.2,      // x extent of a roof, parapet included
  parapet: 0.45,       // parapet height
  minLength: 14,
  maxLength: 30,
  gapMin: 2.4,
  gapMax: 5.2,
  gapChance: 0.55,     // chance a building ends in a gap instead of touching
  landingMargin: 5.5,  // no obstacle this close after a gap
  edgeMargin: 3.0,     // no obstacle this close before a gap
  depthMin: 14,        // how far the building drops below the roof
  depthMax: 34,
  ahead: 170,          // keep this much roof generated in front
  behind: 24,          // recycle this far behind
};

/**
 * Obstacle catalogue. `lanes` is how many adjacent lanes it occupies;
 * `top`/`bottom` is the vertical slab you must avoid: jump over a low `top`,
 * slide under a high `bottom`.
 */
export const OBSTACLES = {
  chimney:  { lanes: 1, bottom: 0,    top: 1.9, weight: 5 },
  tank:     { lanes: 1, bottom: 0,    top: 2.6, weight: 3 },
  dish:     { lanes: 1, bottom: 0,    top: 1.6, weight: 3 },
  ac:       { lanes: 1, bottom: 0,    top: 0.7, weight: 5, low: true },
  vent:     { lanes: 1, bottom: 0,    top: 0.85, weight: 3, low: true },
  skylight: { lanes: 1, bottom: 0,    top: 0.55, weight: 3, low: true },
  wall:     { lanes: 2, bottom: 0,    top: 2.6, weight: 3 },
  line:     { lanes: 3, bottom: 1.05, top: 1.5, weight: 4, high: true },
};

export const ROWS = {
  minSpacing: 7.5,     // metres between obstacle rows at start speed
  speedFactor: 0.45,   // added spacing per m/s of speed
  densityStart: 0.35,  // rows per 10 m at the start
  densityMax: 0.9,
  densityDistance: 2200,
};

export const COINS = {
  value: 1,
  spacing: 1.35,
  radius: 0.55,        // pickup radius
  magnetRadius: 5.5,
  magnetSpeed: 18,
};

export const POWERUPS = {
  spawnEvery: [140, 260],     // metres between power-up spawns
  magnet: { base: 7, perLevel: 1.5 },
  shield: { base: 7, perLevel: 1.5 },
  wings:  { base: 4.5, perLevel: 0.9 },
  wingsHeight: 3.6,
  maxLevel: 5,
};

export const SCORE = {
  perMetre: 1,
  perCoin: 5,
  reviveCost: 60,
  reviveClear: 30,     // metres cleared of obstacles after a revive
};

export const CHASER = {
  gapStart: 3.0,       // metres behind the player at the start
  gapFar: 5.5,         // where he settles once you are fast
  catchTime: 0.7,
};

export const DAY = {
  cycleDistance: 1800, // metres for a full dusk → night → day → dusk cycle
};

/**
 * Playable characters. Colours are hex; `hat` picks a head accessory.
 * The first one is free and selected by default.
 */
export const CHARACTERS = [
  { id: 'ekin',   price: 0,    shirt: 0xff7a1a, pants: 0x2b3a67, skin: 0xf1c7a3, hair: 0x3a2518, hat: 'cap',    hatColor: 0xffd23f },
  { id: 'deniz',  price: 300,  shirt: 0x4d6bff, pants: 0x1c1c28, skin: 0xd9a884, hair: 0x1a1a1a, hat: 'hood',   hatColor: 0x4d6bff },
  { id: 'robot',  price: 700,  shirt: 0x9aa4b2, pants: 0x5d6673, skin: 0xc7d0db, hair: 0xc7d0db, hat: 'antenna', hatColor: 0xff3b3b },
  { id: 'ninja',  price: 1000, shirt: 0x1b1b24, pants: 0x1b1b24, skin: 0xe8c39e, hair: 0x1b1b24, hat: 'mask',   hatColor: 0xb3122e },
  { id: 'astro',  price: 1600, shirt: 0xf4f4f8, pants: 0xdcdde6, skin: 0xf1c7a3, hair: 0x3a2518, hat: 'helmet', hatColor: 0x7fd3ff },
  { id: 'sultan', price: 2500, shirt: 0x8d1f3c, pants: 0xf0d9a0, skin: 0xe2b58d, hair: 0x2a1a10, hat: 'fez',    hatColor: 0xc0182f },
];

export const UPGRADE_PRICES = [0, 120, 260, 480, 800];  // index = current level

export const COLORS = {
  coin: 0xffc83d,
  magnet: 0xff4d6d,
  shield: 0x4dd2ff,
  wings: 0xffe066,
};
