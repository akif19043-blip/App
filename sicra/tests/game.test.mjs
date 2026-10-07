/**
 * Gameplay tests: the run is stepped by hand through the test hook so
 * results do not depend on how fast headless Chromium renders.
 *
 *     node tests/game.test.mjs
 */

import { launch, open, advance, snapshot, check, failed, SHOTS } from './helpers.mjs';

const { browser, page, errors } = await launch();
await open(page);
check('page loads without errors', errors.length === 0, errors.join(' | '));

// A run is deterministic for a seed: same layout twice.
async function layoutSignature(seed) {
  await page.evaluate((s) => { window.__sicra.setAuto(false); window.__sicra.start(s); }, seed);
  return page.evaluate(() => window.__sicra.track.obstacles.slice(0, 12).map((o) => `${o.type}@${o.x.toFixed(1)}/${o.z.toFixed(1)}`).join(','));
}
const sigA = await layoutSignature(7);
const sigB = await layoutSignature(7);
const sigC = await layoutSignature(8);
check('seeded track is reproducible', sigA === sigB && sigA.length > 0);
check('different seed gives a different track', sigA !== sigC);

// Every row leaves a way through: for each obstacle row, at least one lane
// is free or only has a low (jumpable) or high (slidable) obstacle.
const solvable = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(3);
  g.track.ensure(2500, 22);
  const rows = new Map();
  for (const o of g.track.obstacles) {
    const key = Math.round(o.z * 2) / 2;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(o);
  }
  let bad = 0;
  for (const [, list] of rows) {
    const lanes = g.lanes.map((x) => ({ x, blocked: false }));
    for (const o of list) {
      for (const lane of lanes) {
        const inX = Math.abs(lane.x - o.x) < o.halfW + 0.35;
        if (inX && !o.low && !o.high) lane.blocked = true;
      }
    }
    if (lanes.every((l) => l.blocked)) bad += 1;
  }
  return { rows: rows.size, bad };
});
check('every obstacle row is passable', solvable.bad === 0 && solvable.rows > 20, JSON.stringify(solvable));

// Obstacles never sit right after a gap landing.
const landing = await page.evaluate(() => {
  const g = window.__sicra;
  let bad = 0;
  const segs = g.track.segments;
  for (let i = 1; i < segs.length; i += 1) {
    if (!segs[i - 1].gapAfter) continue;
    for (const o of segs[i].obstacles) if (o.z - segs[i].z0 < 5) bad += 1;
  }
  return bad;
});
check('no obstacle inside the landing zone after a gap', landing === 0, 'bad=' + landing);

// Running straight ahead with no input eventually dies (caught or fell).
await page.evaluate(() => { window.__sicra.start(11); });
await advance(page, 40);
let s = await snapshot(page);
check('doing nothing ends the run', s.state === 'over' || s.state === 'dying' || s.dead, JSON.stringify({ state: s.state, dead: s.dead, z: s.z.toFixed(1) }));

// Lane switching moves x to the lane centre.
await page.evaluate(() => { window.__sicra.start(5); });
await page.evaluate(() => window.__sicra.act('left'));
await advance(page, 0.4);
s = await snapshot(page);
check('swipe left reaches the left lane (screen-left is +x)', s.lane === 0 && Math.abs(s.x - 2.2) < 0.01, 'x=' + s.x.toFixed(2));
await page.evaluate(() => { window.__sicra.act('right'); window.__sicra.act('right'); });
await advance(page, 0.6);
s = await snapshot(page);
check('two swipes right reach the right lane', s.lane === 2 && Math.abs(s.x - (-2.2)) < 0.01, 'x=' + s.x.toFixed(2));
await page.evaluate(() => window.__sicra.act('right'));
await advance(page, 0.2);
s = await snapshot(page);
check('cannot leave the roof sideways', s.lane === 2);

// Jump: leaves the ground, comes back down.
await page.evaluate(() => window.__sicra.act('jump'));
await advance(page, 0.25);
const mid = await snapshot(page);
await advance(page, 0.6);
s = await snapshot(page);
check('jump rises then lands', mid.y > 0.6 && !mid.grounded && s.grounded && s.y === 0, `mid=${mid.y.toFixed(2)} end=${s.y.toFixed(2)}`);
check('jump counted in stats', s.stats.jumps === 1);

// Slide: lowers the collision box for a moment.
await page.evaluate(() => window.__sicra.act('slide'));
await advance(page, 0.1);
const sliding = await page.evaluate(() => ({ h: window.__sicra.player.box().y1 - window.__sicra.player.box().y0, sliding: window.__sicra.player.sliding > 0 }));
await advance(page, 1.0);
const stood = await page.evaluate(() => window.__sicra.player.box().y1 - window.__sicra.player.box().y0);
check('slide lowers the box and ends', sliding.sliding && sliding.h < 1 && stood > 1.7, `h=${sliding.h} after=${stood}`);

// Coins: run a short layout and collect a planted line of coins.
const collected = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(21);
  const z = g.player.z + 6;
  g.track.coinLine(1, z, 5);
  g.track.writeCoins();
  const before = g.run.coins;
  g.step(1 / 120, 120);   // one second at 10 m/s covers z+6..z+12
  return g.run.coins - before;
});
check('running through a coin line collects it', collected >= 4, 'collected=' + collected);

// Collision with a chimney kills; a shield smashes it instead.
const hit = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(22);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  const seg = g.track.segments.find((sg) => sg.z0 <= g.player.z && sg.z1 > g.player.z + 10);
  g.track.placeObstacle(seg, 'chimney', 1, g.player.z + 5);
  g.step(1 / 120, 120);
  return { state: g.state, dead: g.player.dead };
});
check('a chimney in your lane ends the run', hit.dead === 'caught' && hit.state === 'dying', JSON.stringify(hit));

const shielded = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(22);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  const seg = g.track.segments.find((sg) => sg.z0 <= g.player.z && sg.z1 > g.player.z + 10);
  g.track.placeObstacle(seg, 'chimney', 1, g.player.z + 5);
  g.player.grant('shield', 1);
  g.step(1 / 120, 120);
  return { state: g.state, dead: g.player.dead, alive: g.track.obstacles.filter((o) => o.alive && o.type === 'chimney').length };
});
check('a shield smashes the chimney instead', shielded.dead === null && shielded.state === 'running', JSON.stringify(shielded));

// Jumping over an AC unit works; running into it does not.
const lowJump = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(23);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  const seg = g.track.segments.find((sg) => sg.z0 <= g.player.z && sg.z1 > g.player.z + 10);
  g.track.placeObstacle(seg, 'ac', 1, g.player.z + 4);
  g.step(1 / 120, 12);      // 0.1 s → 1 m closer
  g.act('jump');
  g.step(1 / 120, 120);
  return { dead: g.player.dead, z: g.player.z };
});
check('jumping clears a low AC unit', lowJump.dead === null, JSON.stringify(lowJump));

// Sliding under a laundry line works; standing does not.
const slideUnder = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(24);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  const seg = g.track.segments.find((sg) => sg.z0 <= g.player.z && sg.z1 > g.player.z + 10);
  g.track.placeObstacle(seg, 'line', 1, g.player.z + 4);
  g.step(1 / 120, 12);
  g.act('slide');
  g.step(1 / 120, 120);
  const ok = g.player.dead === null;
  g.start(24);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  const seg2 = g.track.segments.find((sg) => sg.z0 <= g.player.z && sg.z1 > g.player.z + 10);
  g.track.placeObstacle(seg2, 'line', 1, g.player.z + 4);
  g.step(1 / 120, 120);
  return { slid: ok, stood: g.player.dead };
});
check('sliding passes under the laundry line, standing does not', slideUnder.slid && slideUnder.stood === 'caught', JSON.stringify(slideUnder));

// Gaps: walk into one and fall; jump and clear it.
const gapTest = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(25);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  // find the first gap ahead
  const seg = g.track.segments.find((sg) => sg.gapAfter && sg.z1 > g.player.z + 5);
  const gapZ = seg.z1;
  // run until 0.5 m before the edge
  while (g.player.z < gapZ - 0.5) g.step(1 / 120, 1);
  g.step(1 / 120, 240);
  const fell = g.player.dead;
  // again, jumping at the edge
  g.start(25);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  while (g.player.z < gapZ - 0.8) g.step(1 / 120, 1);
  g.act('jump');
  g.step(1 / 120, 240);
  return { fell, cleared: g.player.dead === null, gaps: g.player.stats.gaps, gap: seg.gap };
});
check('running off the edge is a fall', gapTest.fell === 'fell', JSON.stringify(gapTest));
check('jumping at the edge clears the gap', gapTest.cleared && gapTest.gaps === 1, JSON.stringify(gapTest));

// Magnet pulls coins from a neighbouring lane.
const magnet = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(26);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  g.track.coinLine(0, g.player.z + 4, 5);   // left lane; we stay in the middle
  g.track.writeCoins();
  g.step(1 / 120, 120);
  const without = g.run.coins;
  g.start(26);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  g.track.coinLine(0, g.player.z + 4, 5);
  g.track.writeCoins();
  g.player.grant('magnet', 1);
  g.step(1 / 120, 120);
  return { without, withMagnet: g.run.coins };
});
check('magnet pulls coins from the next lane', magnet.without === 0 && magnet.withMagnet >= 4, JSON.stringify(magnet));

// Wings fly over everything, then land safely.
const wings = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(27);
  g.player.grant('wings', 1);
  g.step(1 / 120, 240);
  const high = g.player.y;
  // keep stepping until he is back on a roof (or far too long has passed)
  let steps = 0;
  while (!g.player.grounded && !g.player.dead && steps < 120 * 8) { g.step(1 / 120, 1); steps += 1; }
  return { high, dead: g.player.dead, landed: g.player.grounded, y: g.player.y, state: g.state, seconds: steps / 120 };
});
check('wings lift the runner and he lands afterwards', wings.high > 3 && wings.dead === null && wings.landed, JSON.stringify(wings));

// Speed ramps up with distance, score with both.
const ramp = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(28);
  const s0 = g.run.speed;
  g.run.distance = 3000;
  g.step(1 / 120, 1);
  return { s0, s1: g.run.speed };
});
check('speed ramps with distance', ramp.s0 <= 10.5 && ramp.s1 >= 21, JSON.stringify(ramp));

// Death → game over screen; revive costs coins and continues.
const over = await page.evaluate(() => {
  const g = window.__sicra;
  g.profile.coins = 500;
  g.start(29);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  const seg = g.track.segments.find((sg) => sg.z0 <= g.player.z && sg.z1 > g.player.z + 10);
  g.track.placeObstacle(seg, 'tank', 1, g.player.z + 4);
  g.run.coins = 7;
  g.step(1 / 120, 120 * 2);
  const afterDeath = { state: g.state, coinsBank: g.profile.coins, hidden: document.getElementById('screen-over').classList.contains('is-hidden') };
  const reviveBtn = document.getElementById('btn-revive');
  const reviveVisible = !reviveBtn.classList.contains('is-hidden') && !reviveBtn.disabled;
  g.revive();
  g.step(1 / 120, 60);
  return { afterDeath, reviveVisible, state: g.state, bank: g.profile.coins, dead: g.player.dead, shield: g.player.power.shield > 0 };
});
check('death shows the game-over screen and banks coins', over.afterDeath.state === 'over' && !over.afterDeath.hidden && over.afterDeath.coinsBank === 507, JSON.stringify(over.afterDeath));
check('revive is offered, costs 60 and continues the run', over.reviveVisible && over.state === 'running' && over.bank === 440 && over.dead === null && over.shield, JSON.stringify(over));

// Near miss registers when switching out of a lane late.
const near = await page.evaluate(() => {
  const g = window.__sicra;
  g.start(30);
  for (const o of g.track.obstacles) g.track.smash(o, false);
  const seg = g.track.segments.find((sg) => sg.z0 <= g.player.z && sg.z1 > g.player.z + 10);
  g.track.placeObstacle(seg, 'chimney', 1, g.player.z + 4.0);
  g.step(1 / 120, 18);          // 0.15 s → 1.5 m closer, 2.5 m left
  g.act('left');
  g.step(1 / 120, 60);
  return { dead: g.player.dead, near: g.run.nearMisses };
});
check('a late lane change counts as a near miss', near.dead === null && near.near >= 1, JSON.stringify(near));

// Pause / resume and quit to menu.
await page.evaluate(() => { window.__sicra.setAuto(true); window.__sicra.start(31); });
await page.click('#btn-pause');
let paused = await page.evaluate(() => ({ state: window.__sicra.state, shown: !document.getElementById('screen-pause').classList.contains('is-hidden') }));
check('pause button pauses', paused.state === 'paused' && paused.shown, JSON.stringify(paused));
await page.click('#btn-resume');
paused = await page.evaluate(() => window.__sicra.state);
check('resume continues', paused === 'running');
await page.evaluate(() => window.__sicra.pause());
await page.click('#btn-quit');
paused = await page.evaluate(() => ({ state: window.__sicra.state, menu: !document.getElementById('screen-menu').classList.contains('is-hidden') }));
check('quit returns to the menu', paused.state === 'menu' && paused.menu, JSON.stringify(paused));

// Real gestures: swipe up on the surface starts the run and jumps.
await page.click('#btn-play');
await page.waitForFunction(() => window.__sicra.state === 'ready');
await page.touchscreen.tap(195, 500);
await page.waitForFunction(() => window.__sicra.state === 'running');
await page.evaluate(() => window.__sicra.setAuto(false));
const before = await snapshot(page);
await page.mouse.move(195, 600);
await page.mouse.down();
await page.mouse.move(195, 500, { steps: 4 });
await page.mouse.up();
await page.evaluate(() => { window.__sicra.setAuto(true); });
await page.waitForTimeout(150);
await page.evaluate(() => window.__sicra.setAuto(false));
s = await snapshot(page);
check('a swipe up starts a jump', s.stats.jumps === before.stats.jumps + 1, `jumps ${before.stats.jumps} → ${s.stats.jumps}`);

// One frame rendered without errors at the end of all this.
await page.evaluate(() => window.__sicra.world.render());
await page.screenshot({ path: `${SHOTS}/game-running.png` });
check('no page errors during the suite', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed');
process.exit(failed() ? 1 : 0);
