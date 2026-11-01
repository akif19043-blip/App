/**
 * Every number a designer would want to nudge, in one place.
 *
 * Distances are world units. The camera always shows at least VIEW.short
 * units across the screen's shorter side, so a phone held upright and a
 * desktop monitor see the same amount of meadow where it matters.
 */

export const VIEW = {
  short: 640,               // world units across the shorter screen side
  maxDpr: 2,                // device pixel ratio cap: past 2 nobody can tell
};

/** The night lasts this long; surviving it is the win. */
export const DAWN = 600;    // seconds

export const PLAYER = {
  hp: 100,
  speed: 155,               // units per second
  radius: 12,
  invulnerable: 0.45,       // seconds of grace after a hit
  magnet: 90,               // pickup pull radius
  pickup: 18,               // distance at which a pulled gem is collected
};

/**
 * Shadow-bugs. `hp`, `damage` and `speed` are at the start of the night;
 * ENEMY_SCALING grows them as it wears on. `xp` is the gem dropped, `gold`
 * the chance (or, above 1, the count) of amber.
 */
export const ENEMIES = {
  gnat:    { hp: 9,    speed: 62,  damage: 7,  radius: 9,  xp: 1,   gold: 0.015, mass: 1 },
  wasp:    { hp: 14,   speed: 165, damage: 9,  radius: 10, xp: 2,   gold: 0.03, mass: 1,
             weave: 0.9 },
  beetle:  { hp: 42,   speed: 44,  damage: 13, radius: 15, xp: 4,   gold: 0.06, mass: 3 },
  spitter: { hp: 22,   speed: 52,  damage: 8,  radius: 11, xp: 3,   gold: 0.05, mass: 1,
             keepAway: 210, fireEvery: 3.6, shotSpeed: 130, shotDamage: 6, fireRange: 380 },
  moth:    { hp: 460,  speed: 58,  damage: 18, radius: 26, xp: 25,  gold: 10,   mass: 8,
             elite: true },
  queen:   { hp: 6500, speed: 50,  damage: 26, radius: 44, xp: 200, gold: 60,   mass: 40,
             boss: true, summonEvery: 4.5, summonCount: 6 },
};

/** Multipliers as the night goes on, per minute elapsed. */
export const ENEMY_SCALING = {
  hpPerMinute: 0.3,         // x4 by dawn
  damagePerMinute: 0.06,    // x1.6 by dawn
  speedPerMinute: 0.02,     // x1.2 by dawn: running away stops working
  /** Bugs further than this share of the view's half-diagonal hurry. */
  catchUpFrom: 0.55,
  catchUp: 1.7,
};

/**
 * What crawls out of the dark, and when. Each entry holds from its `at`
 * (seconds) until the next one; the weights pick the kind of each spawn.
 */
export const WAVES = [
  { at: 0,   mix: { gnat: 1 } },
  { at: 45,  mix: { gnat: 0.75, wasp: 0.25 } },
  { at: 105, mix: { gnat: 0.55, wasp: 0.25, beetle: 0.2 } },
  { at: 180, mix: { gnat: 0.45, wasp: 0.25, beetle: 0.2, spitter: 0.1 } },
  { at: 300, mix: { gnat: 0.35, wasp: 0.3, beetle: 0.2, spitter: 0.15 } },
  { at: 420, mix: { gnat: 0.3, wasp: 0.3, beetle: 0.25, spitter: 0.15 } },
];

export const SPAWN = {
  /** Spawns per second: base + linear * minutes + square * minutes^2. */
  base: 0.8,
  linear: 0.6,
  square: 0.06,
  maxAlive: 280,
  extraAlive: 60,           // headroom for rings and the queen's brood
  margin: 60,               // how far outside the view a spawn appears
  ahead: 0.6,               // share of spawns placed where the player is
                            // heading, so outrunning the swarm is not a plan
  aheadSpread: 1.2,         // radians either side of the heading
  /** A ring of gnats closing in from every side, every `ringEvery`. */
  ringFirst: 90,
  ringEvery: 120,
  ringCount: 24,
  elites: [150, 300, 450],  // a moth at each of these times
  boss: 480,                // the queen
  leash: 1.7,               // view half-diagonals before a straggler is
                            // moved back in front of the player
};

/**
 * Weapons fire on their own. Each array is the value at levels 1..5.
 * `area` stats grow with the Reach passive, cooldowns shrink with Focus,
 * damage grows with Brightness.
 */
export const WEAPONS = {
  spark: {
    cooldown: [0.7, 0.65, 0.6, 0.55, 0.5],
    damage:   [11, 13, 16, 19, 23],
    count:    [1, 1, 2, 2, 3],
    pierce:   [0, 1, 1, 2, 2],
    speed: 430,
    range: 520,
    radius: 5,
  },
  halo: {
    orbs:     [2, 3, 3, 4, 5],
    damage:   [9, 11, 13, 15, 18],
    area:     [62, 66, 72, 78, 84],      // orbit radius
    spin:     [2.6, 2.8, 3.0, 3.3, 3.6], // radians per second
    rehit: 0.45,                         // seconds before an orb hits the same bug
    radius: 9,
  },
  pulse: {
    cooldown: [3.2, 3.0, 2.8, 2.5, 2.2],
    damage:   [16, 20, 26, 32, 40],
    area:     [105, 115, 128, 140, 155],
    knockback: 150,
  },
  arc: {
    cooldown: [1.7, 1.6, 1.5, 1.35, 1.2],
    damage:   [14, 17, 21, 25, 30],
    chains:   [3, 4, 5, 6, 8],
    area:     [130, 130, 140, 150, 160], // jump distance
    range: 420,
  },
  embers: {
    cooldown: [0.32, 0.3, 0.28, 0.25, 0.22],  // one dropped per this, while moving
    damage:   [5, 6, 8, 10, 12],              // per tick
    life:     [2.2, 2.5, 2.8, 3.1, 3.5],
    area:     [16, 17, 19, 21, 24],
    tick: 0.4,
  },
};

/** Passive upgrades: the bonus per level. Five levels each. */
export const PASSIVES = {
  wings:  { speed: 0.08 },
  glow:   { magnet: 0.3 },
  shell:  { hp: 20 },
  nectar: { regen: 0.4 },
  focus:  { cooldown: 0.07 },
  bright: { damage: 0.1 },
  reach:  { area: 0.1 },
};

export const SLOTS = { weapons: 4, passives: 4 };
export const MAX_LEVEL = 5;

/** Experience from level L to L + 1. */
export function xpToNext(level) {
  return Math.round(5 + level * 3 + Math.pow(level, 1.9) * 0.35);
}

/** Gold paid at the end of a run on top of the amber picked up. */
export const RUN_GOLD = {
  perMinute: 5,
  dawn: 100,
};

/**
 * The upgrade shop between runs. Bought with gold, kept forever. `per` is
 * the bonus per level and `cost` the price of each level in turn.
 */
export const META = {
  vitality:  { per: 15,   cost: [80, 160, 320, 560, 900] },    // max HP
  power:     { per: 0.08, cost: [120, 240, 450, 750, 1150] },  // damage
  swiftness: { per: 0.04, cost: [80, 160, 320, 560, 900] },    // move speed
  magnetism: { per: 0.1,  cost: [50, 100, 200, 360, 560] },    // pickup radius
  greed:     { per: 0.1,  cost: [160, 320, 560, 900, 1300] },  // gold earned
  vigor:     { per: 0.25, cost: [120, 240, 450, 750, 1150] },  // HP regen per second
};

/**
 * Rewarded ads. Each is something the player asks for, on a button that says
 * what they get. Free gold is pitched at about half a run's amber.
 */
export const ADS = {
  freeGold: 60,
  freeGoldCooldown: 300,    // seconds between two free-gold offers
  reviveHeal: 0.6,          // share of max HP a revive restores
  reviveClear: 260,         // radius cleared of bugs on revive
  reviveGrace: 2.5,         // seconds of invulnerability after a revive
};
