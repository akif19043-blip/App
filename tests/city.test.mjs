/**
 * City free-roam tests.
 *
 *     python3 tools/serve.py &          # or: node tests/run.mjs, which does both
 *     node tests/city.test.mjs
 *
 * Runs the real page in headless Chromium. Software GL manages about 4 fps
 * here, far too slow to test by wall-clock, so anything that needs game time
 * steps the simulation directly at a fixed 1/60 timestep and drives through
 * `game.testInput` -- the same controls object the touch pads fill in.
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
const check = (n, ok, extra='') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (extra ? '  ' + extra : ''));
};

await page.goto((process.env.GAME_URL || 'http://localhost:8000') + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('screen-menu')?.classList.contains('is-visible'), { timeout: 90000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: SHOTS+'/c1-menu.png' });

await page.click('#btn-play-city');
await page.waitForTimeout(500);
const init = await page.evaluate(() => ({
  mode: game.mode, blocks: game.session.blocks.length, coins: game.session.coins.length,
  traffic: game.session.traffic.cars.length, mission: !!game.session.mission,
  carX: +game.session.car.x.toFixed(1), carZ: +game.session.car.z.toFixed(1),
}));
console.log('   city:', JSON.stringify(init));
check('city built', init.blocks === 36 && init.coins > 50 && init.traffic > 8,
      `${init.blocks} blocks, ${init.coins} coins, ${init.traffic} cars`);
check('mission assigned', init.mission);

// drive: full throttle straight, then a right turn -- heading must actually change
const drive = await page.evaluate(() => {
  const c = game.session.car;
  const h0 = c.heading, x0 = c.x, z0 = c.z;
  for (let i=0;i<180;i++) { game.testInput={steer:0,throttle:1,brake:false}; game.update(1/60); }  // 3 s straight
  const straight = { dz: +(c.z - z0).toFixed(1), dx: +(c.x - x0).toFixed(2), kmh: c.kmh };
  game.testInput = { steer: 1, throttle: 1, brake: false };                                             // full right
  for (let i=0;i<150;i++) game.update(1/60);
  game.testInput = { steer: 0, throttle: 1, brake: false };
  return { straight, headingChange: +(c.heading - h0).toFixed(2), kmh: c.kmh,
           x: +c.x.toFixed(1), z: +c.z.toFixed(1) };
});
console.log('   drive:', JSON.stringify(drive));
check('accelerates forward along -Z', drive.straight.dz < -20 && Math.abs(drive.straight.dx) < 2, JSON.stringify(drive.straight));
check('steering changes heading', Math.abs(drive.headingChange) > 1.0, drive.headingChange+' rad');
await page.screenshot({ path: SHOTS+'/c2-drive.png' });

const perf = await page.evaluate(() => {
  const s = game.session, c = s.car;
  c.place(s.city.streetLines[3] + s.city.laneOffsets[0], 150, 0);
  s.traffic.reset(c.x, c.z);
  for (let i = 0; i < 240; i++) {
    game.testInput = { steer: 0, throttle: 1, brake: false };
    game.update(1/60);
  }
  return { calls: game.renderer.info.render.calls,
           tris: game.renderer.info.render.triangles };
});
console.log('   render while driving:', JSON.stringify(perf));
check('draw calls phone-friendly', perf.calls > 30 && perf.calls < 400, perf.calls+'');

// kerb collision: aim straight at a block
const bump = await page.evaluate(() => {
  const c = game.session.car;
  const [bx, bz] = game.session.city.blockCenters[20];
  c.place(bx, bz + 45, Math.PI);          // south of the block, facing +Z
  for (let i=0;i<240;i++) { game.testInput = { steer: 0, throttle: 1, brake: false }; game.update(1/60); }
  const half = game.session.city.block/2;
  return { z: +c.z.toFixed(1), blockEdge: +(bz+half).toFixed(1), inside: c.z < bz + half,
           speed: +c.speed.toFixed(1), bumped: c.bumped };
});
console.log('   kerb:', JSON.stringify(bump));
check('car cannot drive into a block', !bump.inside && bump.bumped);

// map bounds
const bounds = await page.evaluate(() => {
  const c = game.session.car;
  const half = game.session.city.halfExtent;
  c.place(0, half - 40, Math.PI);
  for (let i=0;i<420;i++) { game.testInput = { steer: 0, throttle: 1, brake: false }; game.update(1/60); }
  return { z: +c.z.toFixed(1), half: +half.toFixed(1), contained: c.z < half };
});
console.log('   bounds:', JSON.stringify(bounds));
check('boundary wall holds the car in', bounds.contained);

// coins along the streets, and the delivery loop: arrive -> paid -> next job
const loop = await page.evaluate(() => {
  const s = game.session, c = s.car;
  // drive a lap of one street to sweep up coins
  const line = s.city.streetLines[3];
  c.place(line + s.city.laneOffsets[0], 200, 0);
  for (let i = 0; i < 60 * 30; i++) {
    game.testInput = { steer: 0, throttle: 1, brake: false };
    game.update(1/60);
  }
  const swept = s.stats.collected;

  // arrive at the beacon: pathfinding is the player's job, not the test's
  const first = { x: s.mission.x, z: s.mission.z, pay: s.mission.pay };
  c.place(first.x, first.z + 2, 0);
  game.update(1/60);
  const afterFirst = { coins: s.stats.coins, deliveries: s.stats.deliveries };
  const moved = s.mission.x !== first.x || s.mission.z !== first.z;
  c.place(s.mission.x, s.mission.z + 2, 0);
  game.update(1/60);
  return { swept, pay: first.pay, afterFirst, moved,
           coins: s.stats.coins, deliveries: s.stats.deliveries };
});
console.log('   free roam:', JSON.stringify(loop));
check('coins are collectable while driving', loop.swept > 0, loop.swept+'');
check('delivery pays out', loop.afterFirst.coins >= loop.pay && loop.afterFirst.deliveries === 1);
check('a new delivery is issued', loop.moved && loop.deliveries === 2);
await page.screenshot({ path: SHOTS+'/c3-city.png' });

// coins are banked to the profile
await page.click('#btn-pause'); await page.waitForTimeout(250);
const banked = await page.evaluate(() => JSON.parse(localStorage.getItem('kumtepe-racer.profile.v1')).coins);
check('earnings are banked on pause', banked >= loop.coins, banked+'');
await page.click('#btn-quit'); await page.waitForTimeout(400);

// highway mode still works
await page.click('#btn-play-highway'); await page.waitForTimeout(600);
const hw = await page.evaluate(() => { for (let i=0;i<300;i++) { game.testInput={steer:0,throttle:1,brake:false}; game.update(1/60); }
  return { mode: game.mode, dist: Math.round(game.session.player.distance), score: Math.round(game.session.run.score) }; });
console.log('   highway:', JSON.stringify(hw));
check('highway mode still runs', hw.mode === 'highway' && hw.dist > 100);
await page.screenshot({ path: SHOTS+'/c4-highway.png' });

await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(600);
await page.screenshot({ path: SHOTS+'/c5-landscape.png' });

console.log(problems.length ? 'JS PROBLEMS:\n'+problems.slice(0,8).join('\n') : 'PASS  no console/page errors');
await browser.close();
if (problems.length) failures += 1;
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
