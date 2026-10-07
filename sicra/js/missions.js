/**
 * Missions: three at a time, drawn from tiered templates. Finishing all
 * three raises the permanent score multiplier and deals a new set.
 *
 * `run` missions compare against the current run's stats; `total` missions
 * accumulate across runs. Progress lives in the profile.
 */

const TEMPLATES = {
  coinsRun:      { scope: 'run',   stat: 'coins',      tiers: [30, 60, 100, 160, 250] },
  coinsTotal:    { scope: 'total', stat: 'coins',      tiers: [200, 500, 1200, 2500] },
  distanceRun:   { scope: 'run',   stat: 'distance',   tiers: [300, 600, 1000, 1600, 2500] },
  distanceTotal: { scope: 'total', stat: 'distance',   tiers: [2000, 5000, 12000] },
  jumps:         { scope: 'run',   stat: 'jumps',      tiers: [15, 30, 50] },
  slides:        { scope: 'run',   stat: 'slides',     tiers: [8, 18, 35] },
  gaps:          { scope: 'run',   stat: 'gaps',       tiers: [5, 12, 25] },
  magnets:       { scope: 'total', stat: 'magnets',    tiers: [2, 5, 10] },
  shields:       { scope: 'total', stat: 'shields',    tiers: [2, 5, 10] },
  wings:         { scope: 'total', stat: 'wings',      tiers: [1, 3, 6] },
  nearMisses:    { scope: 'run',   stat: 'nearMisses', tiers: [3, 8, 15] },
  score:         { scope: 'run',   stat: 'score',      tiers: [1000, 3000, 8000] },
};

const REWARD = [40, 70, 110, 160, 240];

export const MAX_MULTIPLIER = 5;

export function multiplierFor(sets) {
  return Math.min(MAX_MULTIPLIER, 1 + sets * 0.5);
}

function makeMission(type, tier) {
  const tpl = TEMPLATES[type];
  return { type, tier, target: tpl.tiers[tier], progress: 0, scope: tpl.scope, stat: tpl.stat, done: false };
}

/** Make sure the profile has three live missions. */
export function ensure(profile, rng = Math.random) {
  const m = profile.missions;
  if (!m.tiers) m.tiers = {};
  if (!Array.isArray(m.active)) m.active = [];
  m.active = m.active.filter((x) => x && TEMPLATES[x.type] && !x.done);
  const inUse = new Set(m.active.map((x) => x.type));
  const candidates = Object.keys(TEMPLATES).filter((type) => {
    const tier = m.tiers[type] || 0;
    return !inUse.has(type) && tier < TEMPLATES[type].tiers.length;
  });
  while (m.active.length < 3 && candidates.length) {
    const i = Math.floor(rng() * candidates.length);
    const type = candidates.splice(i, 1)[0];
    m.active.push(makeMission(type, m.tiers[type] || 0));
  }
  return m.active;
}

/**
 * Apply the stats of the run in progress. `runStats` holds this run's
 * numbers, `delta` holds what changed since the last call for total-scoped
 * missions. Returns the missions completed by this update.
 */
export function update(profile, runStats, delta) {
  const completed = [];
  for (const mission of profile.missions.active) {
    if (mission.done) continue;
    if (mission.scope === 'run') {
      mission.progress = Math.max(mission.progress, runStats[mission.stat] || 0);
    } else {
      mission.progress += delta[mission.stat] || 0;
    }
    if (mission.progress >= mission.target) {
      mission.progress = mission.target;
      mission.done = true;
      completed.push(mission);
    }
  }
  return completed;
}

/** Pay out finished missions, advance tiers, deal replacements. */
export function settle(profile, rng = Math.random) {
  const m = profile.missions;
  let coins = 0;
  let setFinished = false;
  const done = m.active.filter((x) => x.done);
  if (!done.length) return { coins, setFinished };
  for (const mission of done) {
    coins += REWARD[Math.min(mission.tier, REWARD.length - 1)];
    m.tiers[mission.type] = mission.tier + 1;
    m.completedCount = (m.completedCount || 0) + 1;
  }
  if (done.length === m.active.length) {
    m.completedSets = (m.completedSets || 0) + 1;
    setFinished = true;
  }
  // run-scoped progress of unfinished missions resets with the run
  for (const mission of m.active) if (!mission.done && mission.scope === 'run') mission.progress = 0;
  ensure(profile, rng);
  return { coins, setFinished };
}

export function reward(mission) {
  return REWARD[Math.min(mission.tier, REWARD.length - 1)];
}
