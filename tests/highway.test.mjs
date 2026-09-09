/**
 * Traffic-racer (highway) tests: profile, garage purchases, pause/resume,
 * scoring over a long simulated run, and the far-from-origin rebase.
 *
 *     node tests/highway.test.mjs
 *
 * See city.test.mjs for why game time is stepped rather than waited on.
 */

import { chromium } from 'playwright';
const SHOTS = process.env.SHOT_DIR || '.test-shots';
const problems = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('console', m => { if (m.type()==='error') problems.push('CONSOLE '+m.text()); });
page.on('pageerror', e => problems.push('PAGEERROR '+e.message));

let failures = 0;
const check = (name, ok, extra='') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};

await page.goto((process.env.GAME_URL || 'http://localhost:8000') + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('screen-menu')?.classList.contains('is-visible'), { timeout: 60000 });
check('assets load and menu appears', true);

// service worker registers
const swOk = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false));
check('service worker registers', swOk);

// settings toggles
await page.click('#btn-settings'); await page.waitForTimeout(200);
await page.click('#toggle-throttle'); await page.waitForTimeout(150);
const gasHidden = await page.evaluate(() => document.getElementById('btn-gas').classList.contains('is-hidden'));
check('auto throttle hides the gas pedal', gasHidden);
await page.click('#toggle-throttle'); await page.waitForTimeout(120);
await page.click('#btn-settings-back');

// buying a car with insufficient funds is refused, with funds succeeds
await page.click('#btn-garage'); await page.waitForTimeout(200);
const lockedDisabled = await page.evaluate(() => document.querySelectorAll('.car-card')[1].querySelector('button').disabled);
check('locked car is not purchasable at 0 coins', lockedDisabled);
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('kumtepe-racer.profile.v1')||'{}'); s.coins = 99999; localStorage.setItem('kumtepe-racer.profile.v1', JSON.stringify(s)); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('screen-menu')?.classList.contains('is-visible'), { timeout: 60000 });
await page.click('#btn-garage'); await page.waitForTimeout(250);
await page.click('.car-card:nth-child(3) .car-card__action'); await page.waitForTimeout(350);
const bought = await page.evaluate(() => ({ owned: JSON.parse(localStorage.getItem('kumtepe-racer.profile.v1')).owned, selected: game.sessions.city.car.spec.id }));
check('buying + equipping the super car works', bought.owned.includes('super') && bought.selected === 'super', JSON.stringify(bought));
await page.screenshot({ path: SHOTS+'/f-garage.png' });
await page.click('#btn-garage-back');

// pause / resume
await page.click('#btn-play-highway'); await page.waitForTimeout(400);
await page.click('#btn-pause'); await page.waitForTimeout(250);
check('pause stops the run', await page.evaluate(() => game.state === 'paused'));
await page.click('#btn-resume'); await page.waitForTimeout(200);
check('resume restarts the run', await page.evaluate(() => game.state === 'playing'));

// A long autopilot run is only a smoke test: the crude lane-picker's results
// swing with random traffic, so it asserts nothing tighter than "the sim ran".
const run = await page.evaluate(() => {
  const p = game.session.player;
  for (let i = 0; i < 60 * 90 && game.state === 'playing'; i++) {
    let best = p.x, bestGap = -1;
    for (const lane of game.session.lanes) {
      let gap = 400;
      for (const c of game.session.traffic.active) {
        if (Math.abs(c.holder.position.x - lane) > 2.2) continue;
        const d = p.z - c.holder.position.z;
        if (d > 0 && d < gap) gap = d;
      }
      gap -= Math.abs(lane - p.x) * 5;
      if (gap > bestGap) { bestGap = gap; best = lane; }
    }
    game.testInput = { steer: Math.max(-1, Math.min(1, (best - p.x) * 1.5)), throttle: 1, brake: false };
    if (bestGap < 55 && Math.abs(best - p.x) > 1.0) {
      game.testInput.brake = true; game.testInput.throttle = 0;
    }
    if (p.nitro > 0.6 && bestGap > 200) p.requestBoost();
    game.update(1/60);
  }
  return { state: game.state, dist: Math.round(p.distance),
           score: Math.round(game.session.run.score), maxKmh: p.kmh };
});
console.log('   90s autopilot run:', JSON.stringify(run));
check('a long run accumulates distance and score', run.dist > 300 && run.score > 300,
      `${run.dist} m, ${run.score} pts`);

// The scoring rules themselves are tested deterministically: the autopilot may
// or may not happen to drive over a coin, but the rule must always fire.
const coin = await page.evaluate(() => {
  game.startRun('highway');
  const p = game.session.player;
  // Coin runs are laid down as the player advances, and only ~75% of spawn
  // points get one, so drive until one actually exists rather than assuming
  // the first update produced it.
  let target = null;
  for (let i = 0; i < 60 * 30 && !target; i++) {
    game.testInput = { steer: 0, throttle: 1, brake: false };
    game.update(1/60);
    target = game.session.pickups.coins.find((c) => c.inUse);
  }
  if (!target) return { skipped: true };
  const before = game.session.run.coins;
  p.x = target.object.position.x;
  p.z = target.object.position.z;
  game.update(1/60);
  return { before, after: game.session.run.coins, nitroPickups: 0 };
});
check('driving over a coin banks it', !coin.skipped && coin.after === coin.before + 1,
      JSON.stringify(coin));

// Overtake + near miss: a slower car placed just ahead, offset far enough not
// to collide but close enough to count as a squeeze.
const pass = await page.evaluate(() => {
  game.startRun('highway');
  const p = game.session.player;
  const traffic = game.session.traffic;
  // traffic populates on the first update, not at start
  game.testInput = { steer: 0, throttle: 1, brake: false };
  game.update(1/60);
  // park everything far ahead so only the car under test can be passed
  for (const c of traffic.active) c.holder.position.z = p.z - 4000;
  const car = traffic.active[0];
  if (!car) return { skipped: true };
  car.speed = 8;
  car.passed = false;
  car.holder.position.set(p.x + 2.3, 0, p.z - 25);
  const before = { overtakes: game.session.run.overtakes,
                   nearMisses: game.session.run.nearMisses };
  p.speed = 40;
  for (let i = 0; i < 60 * 4; i++) {
    game.testInput = { steer: 0, throttle: 1, brake: false };
    game.update(1/60);
    if (game.session.run.overtakes > before.overtakes) break;
  }
  return { before, overtakes: game.session.run.overtakes,
           nearMisses: game.session.run.nearMisses, state: game.state };
});
check('passing a slower car counts an overtake',
      !pass.skipped && pass.overtakes === pass.before.overtakes + 1,
      JSON.stringify(pass));
check('a close pass also counts a near miss',
      pass.nearMisses === pass.before.nearMisses + 1);
check('a close pass is not a collision', pass.state === 'playing');

const perf = await page.evaluate(() => ({ calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles }));
console.log('   draw calls', perf.calls, 'triangles', perf.tris);
// Traffic spawns at random positions, so the count moves between runs -- it
// sits around 240-330 here. This guards against a regression into the
// thousands, not against a handful either way.
check('draw calls stay phone-friendly', perf.calls > 40 && perf.calls < 400,
      perf.calls+'');

// Drive past the rebase threshold for real (collisions off) and confirm the
// world is still assembled around the car afterwards.
const rebase = await page.evaluate(() => {
  game.startRun('highway');
  const realCollides = game.session.collides.bind(game.session);
  game.session.collides = () => false;
  game.startRun('highway');
  game.testInput = { steer: 0, throttle: 1, brake: false };
  let guard = 0;
  while (game.session.player.distance < 12600 && guard++ < 200000) { game.testInput={steer:0,throttle:1,brake:false}; game.update(1/60); }
  const p = game.session.player;
  const nearestTile = Math.min(...game.session.world.tiles.map(t => Math.abs(t.position.z - p.z)));
  const out = { distance: Math.round(p.distance), z: Math.round(p.z),
                camGap: Math.round(game.camera.position.z - p.z),
                nearestTileGap: Math.round(nearestTile),
                traffic: game.session.traffic.active.length,
                finite: Number.isFinite(p.z) && Number.isFinite(p.x) };
  game.session.collides = realCollides;
  return out;
});
console.log('   after 12.6 km:', JSON.stringify(rebase));
check('rebase keeps coordinates small', Math.abs(rebase.z) < 12000, rebase.z+'');
check('road still under the car after rebase', rebase.nearestTileGap < 45);
check('camera still behind the car after rebase', rebase.camGap > 4 && rebase.camGap < 14);
check('traffic survives rebase', rebase.traffic > 3, rebase.traffic+'');

await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(700);
await page.screenshot({ path: SHOTS+'/f-landscape.png' });
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);

console.log(problems.length ? 'JS PROBLEMS:\n'+problems.slice(0,8).join('\n') : 'PASS  no console/page errors');
await browser.close();
if (problems.length) failures += 1;
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
