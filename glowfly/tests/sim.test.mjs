/**
 * The night itself, without a browser: run.js stepped at a fixed timestep.
 *
 *     node tests/sim.test.mjs
 *
 * Seeds are fixed, so every number here is the same on every machine: these
 * are regression checks on the rules and the balance, not dice rolls.
 */

import { Run } from '../js/run.js';
import { DAWN, MAX_LEVEL, SLOTS, SPAWN, xpToNext } from '../js/config.js';

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};

const STEP = 1 / 60;

/**
 * A stand-in player with human-ish limits: it only reacts to bugs within
 * `see` units, wanders otherwise, and picks up dew it passes near.
 */
function bot(see) {
  let until = 0;
  let heading = 0;
  return (run) => {
    const p = run.player;
    let ax = 0;
    let ay = 0;
    for (const e of run.enemies) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < see) {
        const w = ((see - d) / see) * Math.sqrt(e.mass) * 3;
        ax += (dx / d) * w;
        ay += (dy / d) * w;
      }
    }
    // Step away from a shot heading in -- the one thing anyone does.
    for (const spit of run.spits) {
      const dx = p.x - spit.x;
      const dy = p.y - spit.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 70) {
        ax += (-spit.vy / 130) * 2 * Math.sign(dx * -spit.vy + dy * spit.vx || 1);
        ay += (spit.vx / 130) * 2 * Math.sign(dx * -spit.vy + dy * spit.vx || 1);
      }
    }
    if (run.time > until) {
      until = run.time + 2;
      heading = (heading + 2.3) % (Math.PI * 2);
    }
    let best = null;
    let bestD = 160;
    for (const g of run.gems) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d > 1 && d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (best) {
      ax += (best.x - p.x) / bestD;
      ay += (best.y - p.y) / bestD;
    } else {
      ax += Math.cos(heading) * 0.6;
      ay += Math.sin(heading) * 0.6;
    }
    const l = Math.hypot(ax, ay) || 1;
    return { x: ax / l, y: ay / l };
  };
}

function night(seed, meta = {}, see = 80, limit = DAWN + 5) {
  const run = new Run({ seed, meta });
  run.view = { w: 1138, h: 640 };
  const drive = bot(see);
  while (!run.over && run.time < limit) {
    while (run.pendingLevels > 0) run.choose(run.offerChoices()[0]);
    run.step(STEP, drive(run));
    run.events.length = 0;
  }
  return run;
}

// --- the same seed is the same night -----------------------------------------
{
  const a = night(11, {}, 80, 90);
  const b = night(11, {}, 80, 90);
  check('a seed replays exactly', a.kills === b.kills && a.player.x === b.player.x
        && a.amber === b.amber, `${a.kills} kills, x ${a.player.x.toFixed(2)}`);
}

// --- bad input is no input ----------------------------------------------------
{
  const run = new Run({ seed: 1 });
  for (let i = 0; i < 30; i += 1) run.step(STEP, { x: NaN, y: Infinity });
  check('NaN steering leaves the firefly where it was',
        run.player.x === 0 && run.player.y === 0 && Number.isFinite(run.player.hp));
  for (let i = 0; i < 60; i += 1) run.step(STEP, { x: 5, y: 0 });
  check('steering is clamped to full speed', Math.abs(run.player.x - run.stats.speed) < 1,
        run.player.x.toFixed(1));
}

// --- the night gets busier ------------------------------------------------------
{
  const run = new Run({ seed: 2 });
  check('the swarm starts thin', run.spawnRate() < 1.5);
  run.time = 300;
  const mid = run.spawnRate();
  run.time = 570;
  check('and thickens toward dawn', run.spawnRate() > mid * 1.5 && mid > 1,
        `${mid.toFixed(1)}/s at 5:00, ${run.spawnRate().toFixed(1)}/s at 9:30`);
  run.time = 0;
  const kinds = new Set();
  const late = new Run({ seed: 2 });
  late.time = 400;
  for (let i = 0; i < 300; i += 1) kinds.add(late.rng.weighted(late.waveMix()));
  check('late waves bring every kind of bug', ['gnat', 'wasp', 'beetle', 'spitter'].every((k) => kinds.has(k)),
        [...kinds].join(','));
}

// --- the cap holds ----------------------------------------------------------------
{
  const run = new Run({ seed: 3 });
  run.player.hp = run.player.maxHp = 1e9;
  run.time = 560;
  for (let i = 0; i < 60 * 30; i += 1) run.step(STEP, { x: 0, y: 0 });
  check('the swarm never passes its cap', run.enemies.length <= SPAWN.maxAlive + SPAWN.extraAlive + 2,
        `${run.enemies.length} alive`);
  check('the queen has come by then', run.bossSpawned);
}

// --- weapons ------------------------------------------------------------------------
{
  const run = new Run({ seed: 4 });
  run.addEnemy('gnat', { x: 120, y: 0 });
  for (let i = 0; i < 60; i += 1) run.step(STEP, { x: 0, y: 0 });
  check('the spark finds and kills a gnat', run.kills >= 1);
  check('and it leaves dew behind', run.gems.some((g) => g.kind === 'xp') || run.xp > 0);

  const pulse = new Run({ seed: 4 });
  pulse.weapons.set('pulse', { level: 1, timer: 0 });
  const beetle = pulse.addEnemy('beetle', { x: 60, y: 0 });
  beetle.hp = beetle.maxHp = 1e6;
  pulse.step(STEP, { x: 0, y: 0 });
  pulse.step(STEP, { x: 0, y: 0 });
  check('a pulse hurts and knocks back what is near', beetle.hp < 1e6 && beetle.pushX > 0);

  const arc = new Run({ seed: 4 });
  arc.weapons.delete('spark');
  arc.weapons.set('arc', { level: 1, timer: 0 });
  const line = [80, 160, 240, 320, 400].map((x) => arc.addEnemy('beetle', { x, y: 0 }));
  line.forEach((e) => { e.hp = e.maxHp = 1e6; e.speed = 0; });
  arc.step(STEP, { x: 0, y: 0 });
  const struck = line.filter((e) => e.hp < 1e6).length;
  check('an arc chains to as many bugs as its level allows', struck === 3, `${struck} struck`);
}

// --- level-ups ----------------------------------------------------------------------
{
  const run = new Run({ seed: 5 });
  run.take({ kind: 'xp', value: xpToNext(1) });
  check('enough dew is a level-up', run.level === 2 && run.pendingLevels === 1);
  run.step(STEP, { x: 1, y: 0 });
  check('the night waits while a card is chosen', run.time === 0);
  const choices = run.offerChoices();
  check('three choices are offered', choices.length === 3 && new Set(choices.map((c) => c.id)).size === 3);
  const again = run.offerChoices(choices);
  check('a reroll offers different ones', again.every((c) => !choices.some((p) => p.id === c.id)),
        again.map((c) => c.id).join(','));
  run.choose({ kind: 'passive', id: 'shell', level: 1 });
  check('a choice is applied', run.passive('shell') === 1 && run.player.maxHp === 120
        && run.player.hp === 120 && run.pendingLevels === 0);

  // Fill every slot, then max everything: the offers must respect both.
  const full = new Run({ seed: 6 });
  for (let i = 0; i < 200; i += 1) {
    full.pendingLevels = 1;
    const offer = full.offerChoices();
    full.choose(offer[0]);
  }
  check('weapon slots are never exceeded', full.weapons.size === SLOTS.weapons);
  check('passive slots are never exceeded', full.passives.size === SLOTS.passives);
  check('nothing passes the top level', [...full.weapons.values()].every((w) => w.level <= MAX_LEVEL)
        && [...full.passives.values()].every((l) => l <= MAX_LEVEL));
  full.pendingLevels = 1;
  check('with everything maxed, honey is offered', full.offerChoices()[0].id === 'honey');
}

// --- death and the revive -----------------------------------------------------------
{
  const run = new Run({ seed: 7 });
  for (let i = 0; i < 12; i += 1) run.addEnemy('gnat', { x: Math.cos(i) * 18, y: Math.sin(i) * 18 });
  run.player.hp = 1;
  run.step(STEP, { x: 0, y: 0 });
  check('a touch at low health ends the run', run.over && !run.won);
  const kills = run.kills;
  check('the revive brings the firefly back', run.revive() && !run.over
        && run.player.hp > run.player.maxHp / 2 && run.player.inv > 2);
  check('and clears the bugs around it, without paying for them',
        run.enemies.every((e) => Math.hypot(e.x, e.y) > 200) && run.kills === kills);
  run.over = true;
  check('but only once a run', run.revive() === false);
}

// --- dawn ----------------------------------------------------------------------------
{
  const run = new Run({ seed: 8 });
  run.player.hp = run.player.maxHp = 1e9;
  run.time = DAWN - 0.05;
  for (let i = 0; i < 10; i += 1) run.step(STEP, { x: 0, y: 0 });
  check('reaching dawn wins the night', run.over && run.won);
  check('and a won night cannot be revived', run.revive() === false);
}

// --- balance -------------------------------------------------------------------------
// Loose bounds on purpose: these catch a change that makes the game trivial
// or impossible, not a few seconds either way.
{
  const fresh = [1, 2, 3, 4, 5].map((seed) => night(seed));
  const freshWins = fresh.filter((r) => r.won).length;
  const median = fresh.map((r) => r.time).sort((a, b) => a - b)[2];
  check('a first night is usually lost', freshWins <= 1, `${freshWins}/5 won`);
  check('but not in the first minute', median > 90, `median ${Math.round(median)} s`);
  check('and it levels up a fair few times', fresh.every((r) => r.level >= 4),
        fresh.map((r) => r.level).join(','));
  const strong = { vitality: 5, power: 5, swiftness: 5, magnetism: 5, vigor: 5 };
  const maxed = [1, 2, 3, 4, 5].map((seed) => night(seed, strong));
  const maxedWins = maxed.filter((r) => r.won).length;
  check('a fully upgraded firefly usually sees dawn', maxedWins >= 3, `${maxedWins}/5 won`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
