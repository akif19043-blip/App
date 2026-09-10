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
// Software rendering here manages a handful of frames per second, and
// Playwright's actionability checks want the element stable across frames.
// Give them room rather than skipping the check -- whether a button is
// actually clickable is part of what these suites verify.
page.setDefaultTimeout(60000);
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
check('city built', init.blocks === 64 && init.coins > 50 && init.traffic > 8,
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

// Steering direction. Getting this backwards is invisible in a headless
// screenshot but ruins the game, so it is pinned: from heading 0 (facing -Z)
// a full right lock must curve the car toward +X, with the front wheels
// pointing that way too.
const steering = await page.evaluate(() => {
  const c = game.session.car;
  const out = {};
  for (const [name, steer] of [['right', 1], ['left', -1]]) {
    c.place(0, 0, 0);
    c.speed = 20;
    for (let i = 0; i < 90; i++) {
      game.testInput = { steer, throttle: 1, brake: false };
      game.update(1/60);
    }
    out[name] = { x: +c.x.toFixed(2), wheel: +c.wheels.front[0].rotation.y.toFixed(2) };
  }
  return out;
});
console.log('   steering:', JSON.stringify(steering));
check('steering right goes right', steering.right.x > 1 && steering.left.x < -1);
check('front wheels point where the car turns',
      steering.right.wheel < 0 && steering.left.wheel > 0);

// Signals: the phase table must cycle, and both axes must never be green at
// the same time.
const signals = await page.evaluate(() => {
  const s = game.session.signals;
  s.set(0, 0);
  const seen = new Set();
  let bothGreen = 0;
  for (let i = 0; i < 60 * 60; i++) {
    s.update(1/60);
    seen.add(s.index);            // two phases are both all-red, so index it
    if (s.isGreen('x') && s.isGreen('z')) bothGreen += 1;
  }
  const lit = Object.entries(s.materials.x)
    .filter(([, m]) => m.emissiveIntensity > 1).map(([name]) => name);
  return { phases: seen.size, bothGreen, lampsFound: Object.keys(s.materials.x).length
    + Object.keys(s.materials.z).length, litOnX: lit };
});
console.log('   signals:', JSON.stringify(signals));
check('all six signal lamps were found', signals.lampsFound === 6);
check('the signal cycle visits every phase', signals.phases === 6);
check('the two axes are never green together', signals.bothGreen === 0);
check('exactly one lamp is lit per axis', signals.litOnX.length === 1);

// Traffic behaviour over three simulated minutes: obeys reds, takes turns,
// and -- the one that really matters -- never ends up inside a block.
const behaviour = await page.evaluate(() => {
  const s = game.session, half = s.city.block / 2;
  let worst = -99, turning = 0, stopped = 0, moving = 0;
  for (let i = 0; i < 60 * 180; i++) {
    game.testInput = { steer: 0, throttle: 0, brake: true };
    game.update(1/60);
    if (i % 5) continue;
    for (const car of s.traffic.cars) {
      if (car.turn) turning += 1;
      if (car.speed < 0.4) stopped += 1; else moving += 1;
      const [bx, bz] = s.collider.blockCentre(car.holder.position.x,
                                              car.holder.position.z);
      const penetration = Math.min(half - Math.abs(car.holder.position.x - bx),
                                   half - Math.abs(car.holder.position.z - bz));
      if (penetration > worst) worst = penetration;
    }
  }
  return { worst: +worst.toFixed(2), turning, stopped, moving };
});
console.log('   traffic over 3 minutes:', JSON.stringify(behaviour));
check('no traffic car ever enters a block', behaviour.worst <= 0,
      behaviour.worst + ' m from a kerb at the closest');
check('traffic queues at red lights', behaviour.stopped > 100, behaviour.stopped+'');
check('traffic takes turns at junctions', behaviour.turning > 50, behaviour.turning+'');

// Reversing swings the camera round to the front of the car.
const reverse = await page.evaluate(() => {
  const s = game.session, c = s.car;
  s.reverseBlend = 0;
  c.place(s.city.streetLines[3] + s.city.laneOffsets[0], 60, 0);
  c.speed = 0;
  const settle = (steps, brake) => {
    for (let i = 0; i < steps; i++) {
      game.testInput = { steer: 0, throttle: 0, brake };
      game.update(1/60);
      s.updateCamera(1/60, game.camera);
    }
  };
  settle(120, false);             // let the chase camera catch up first
  const early = game.camera.position.z - c.z;
  settle(240, true);              // now hold the brake into reverse
  return { speed: +c.speed.toFixed(1), blend: +s.reverseBlend.toFixed(2),
           early: +early.toFixed(1), late: +(game.camera.position.z - c.z).toFixed(1) };
});
console.log('   reverse camera:', JSON.stringify(reverse));
check('braking past a stop reverses the car', reverse.speed < -2);
check('the camera swings to the front when reversing',
      reverse.early > 0 && reverse.late < 0, JSON.stringify(reverse));

// The delivery pointer only appears when the beacon is off screen, and points
// the right way when it does.
const arrow = await page.evaluate(() => {
  const s = game.session, c = s.car;
  s.reverseBlend = 0;
  c.place(0, 0, 0);
  c.speed = 0;
  for (let i = 0; i < 40; i++) s.updateCamera(0.05, game.camera);
  game.camera.updateMatrixWorld();
  const at = (x, z) => {
    s.mission = { x, z, pay: 100 };
    const marker = game.targetMarker(s.mission);
    return { visible: marker.visible,
             angle: marker.visible ? Math.round(marker.angle) : null };
  };
  return { behind: at(0, 200), ahead: at(0, -60),
           left: at(-200, 0), right: at(200, 0) };
});
console.log('   delivery pointer:', JSON.stringify(arrow));
check('pointer hides while the beacon is on screen', !arrow.ahead.visible);
check('pointer shows and aims correctly when off screen',
      arrow.behind.visible && Math.abs(arrow.behind.angle) === 180
      && arrow.left.angle === -90 && arrow.right.angle === 90,
      JSON.stringify(arrow));

// Pedestrians must stay on the pavement -- which is the block footprint the
// car cannot enter -- so they can never be hit or block traffic.
const walkers = await page.evaluate(() => {
  const s = game.session, half = s.city.block / 2;
  const start = s.pedestrians.people.map((p) => p.root.position.z);
  let offPavement = 0, minInset = 99, legSwing = 0;
  for (let i = 0; i < 60 * 30; i++) {
    game.testInput = { steer: 0, throttle: 0, brake: true };
    game.update(1/60);
    if (i % 9) continue;
    for (const person of s.pedestrians.people) {
      const dx = Math.abs(person.root.position.x - person.block.x);
      const dz = Math.abs(person.root.position.z - person.block.z);
      const inset = half - Math.max(dx, dz);      // distance inside the kerb
      if (inset < 0) offPavement += 1;
      if (inset < minInset) minInset = inset;
      legSwing = Math.max(legSwing, Math.abs(person.legs[0].rotation.x));
    }
  }
  const moved = s.pedestrians.people
    .filter((p, i) => Math.abs(p.root.position.z - start[i]) > 0.5).length;
  return { offPavement, minInset: +minInset.toFixed(2), legSwing: +legSwing.toFixed(2),
           moved, total: s.pedestrians.people.length };
});
console.log('   pedestrians:', JSON.stringify(walkers));
check('pedestrians never step off the pavement', walkers.offPavement === 0,
      walkers.minInset + ' m inside the kerb at the closest');
check('pedestrians actually walk', walkers.moved > walkers.total / 2,
      `${walkers.moved}/${walkers.total} moved`);
check('their legs swing', walkers.legSwing > 0.2);

// Garage: parts cost money, raise the stat they name, and stick.
// Pause first: the run banks coins and damage on a timer, and a profile
// written from under us would undo the edit before the reload picks it up.
await page.evaluate(() => {
  const key = 'dortyol.profile.v1';
  game.pause();
  const profile = JSON.parse(localStorage.getItem(key));
  profile.coins = 50000;
  profile.upgrades = {};
  localStorage.setItem(key, JSON.stringify(profile));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('screen-menu')?.classList.contains('is-visible'), { timeout: 120000 });
await page.click('#btn-garage');
await page.waitForTimeout(300);

const before = await page.evaluate(() => ({
  coins: JSON.parse(localStorage.getItem('dortyol.profile.v1')).coins,
  topSpeed: game.sessions.city.car.spec.topSpeed,
  paint: game.sessions.city.car.spec.paint,
}));
await page.click('.tune__row[data-part="engine"]');
await page.waitForTimeout(250);
await page.click('.tune__paint[data-paint="#2f9e5f"]');
await page.waitForTimeout(250);
const after = await page.evaluate(() => ({
  coins: JSON.parse(localStorage.getItem('dortyol.profile.v1')).coins,
  topSpeed: game.sessions.city.car.spec.topSpeed,
  paint: game.sessions.city.car.spec.paint,
  level: JSON.parse(localStorage.getItem('dortyol.profile.v1')).upgrades.sport.engine,
}));
console.log('   garage:', JSON.stringify({ before, after }));
check('an engine part raises top speed', after.topSpeed > before.topSpeed);
check('the part is paid for', after.coins === before.coins - 900);
check('the part level is saved', after.level === 1);
check('paint applies and is saved', after.paint === '#2f9e5f');

// Skint players cannot buy.
const broke = await page.evaluate(() => {
  const key = 'dortyol.profile.v1';
  const profile = JSON.parse(localStorage.getItem(key));
  profile.coins = 10;
  localStorage.setItem(key, JSON.stringify(profile));
  return null;
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('screen-menu')?.classList.contains('is-visible'), { timeout: 120000 });
await page.click('#btn-garage');
await page.waitForTimeout(300);
const locked = await page.evaluate(() =>
  [...document.querySelectorAll('.tune__row')].every((row) => row.disabled));
check('parts are not buyable without the money', locked);
await page.click('#btn-garage-back');
await page.waitForTimeout(150);
await page.click('#btn-play-city');
await page.waitForTimeout(300);

// Deliveries are timed: beat the clock for the bonus, miss it and you do not.
const timing = await page.evaluate(() => {
  const s = game.session, c = s.car;
  // clear the coins so the only money moving is the delivery fee
  for (const coin of s.coins) { coin.taken = true; coin.object.visible = false; }
  // This check is about the clock, not about which job the roll hands out:
  // multi-stop jobs deliberately pay nothing until the last stop, so keep
  // rolling until a single-stop one comes up.
  const single = () => {
    for (let i = 0; i < 60 && (!s.mission || s.mission.stops.length > 1); i++) {
      s.newMission();
    }
    return { ...s.mission };
  };

  const first = single();
  const route = Math.abs(first.x - c.x) + Math.abs(first.z - c.z);

  const before = s.stats.coins;
  c.place(first.x, first.z + 2, 0);
  game.update(1/60);
  const onTime = s.stats.coins - before;

  const second = single();
  s.mission.left = 0.001;                       // run the clock out
  game.update(1/60);
  const mid = s.stats.coins;
  c.place(s.mission.x, s.mission.z + 2, 0);
  game.update(1/60);
  const late = s.stats.coins - mid;

  // put the coins back for the tests that follow
  s.scatterCoins(s.city.streetLines, s.city.halfExtent - 14);
  return { route: Math.round(route), limit: +first.limit.toFixed(1),
           pay: first.pay, bonus: first.bonus, onTime,
           latePay: second.pay, late, expired: true };
});
console.log('   deliveries:', JSON.stringify(timing));
check('the clock follows the street grid, not the crow',
      timing.limit > timing.route / 20 && timing.limit < timing.route / 6,
      `${timing.route} m in ${timing.limit} s`);
check('beating the clock pays the bonus', timing.onTime === timing.pay + timing.bonus);
check('missing the clock pays only the fee', timing.late === timing.latePay);

// A gamepad drives the real input path, not a test hook.
const pad = await page.evaluate(() => {
  const fake = {
    connected: true, axes: [1, 0, 0, 0],
    buttons: Array.from({ length: 8 }, (_, i) => ({
      pressed: i === 7, value: i === 7 ? 1 : 0,
    })),
  };
  navigator.getGamepads = () => [fake];
  delete game.testInput;                        // real input only from here

  const c = game.session.car;
  c.place(0, 0, 0);
  c.speed = 0;
  for (let i = 0; i < 90; i++) game.update(1/60);
  const right = { x: +c.x.toFixed(2), kmh: c.kmh };

  fake.axes[0] = -1;
  c.place(0, 0, 0);
  c.speed = 0;
  for (let i = 0; i < 90; i++) game.update(1/60);
  return { right, left: { x: +c.x.toFixed(2) } };
});
console.log('   gamepad:', JSON.stringify(pad));
check('the gamepad trigger drives the car', pad.right.kmh > 20, pad.right.kmh + ' km/sa');
check('the gamepad stick steers both ways',
      pad.right.x > 1 && pad.left.x < -1, JSON.stringify(pad));

// Car parks are the one block type you can drive into; everything else stays
// solid. Both halves matter -- an open block that traps you is worse than none.
const lots = await page.evaluate(() => {
  const s = game.session, c = s.car, half = s.city.block / 2;
  const parks = s.blocks.map((b, i) => ({ ...b, i }))
    .filter((b) => b.kind === 'block_parking');
  if (!parks.length) return { parks: 0 };

  const drive = (block, seconds) => {
    c.place(block.x, block.z - half - 12, Math.PI);   // north of it, facing +Z
    let inside = 0;
    for (let i = 0; i < 60 * seconds; i++) {
      game.testInput = { steer: 0, throttle: 1, brake: false };
      game.update(1/60);
      if (Math.abs(c.x - block.x) < half - 1 && Math.abs(c.z - block.z) < half - 1) {
        inside += 1;
      }
    }
    return inside;
  };

  const intoPark = drive(parks[0], 12);
  const solid = s.blocks.find((b) => b.kind !== 'block_parking');
  const intoSolid = drive(solid, 10);

  // and the obstacles inside the park still stop the car
  const shapes = s.city.blockShapes.block_parking;
  let insideObstacle = 0;
  c.place(parks[0].x, parks[0].z - half + 4, Math.PI);
  for (let i = 0; i < 60 * 25; i++) {
    game.testInput = { steer: i % 240 < 120 ? 1 : -1, throttle: 1, brake: false };
    game.update(1/60);
    for (const [sx, sz, hx, hz] of shapes) {
      if (Math.abs(c.x - (parks[0].x + sx)) < hx - 0.2
          && Math.abs(c.z - (parks[0].z + sz)) < hz - 0.2) insideObstacle += 1;
    }
  }
  return { parks: parks.length, intoPark, intoSolid, insideObstacle };
});
console.log('   car parks:', JSON.stringify(lots));
check('the map has car parks', lots.parks > 0, lots.parks + '');
check('a car park can be driven into', lots.intoPark > 60, lots.intoPark + ' samples inside');
check('other blocks stay solid', lots.intoSolid === 0);
check('obstacles inside the park still stop the car', lots.insideObstacle === 0);

// Landmarks: three fixed buildings you can steer by. They must land on the
// cells the config names (not wherever the random roll puts them), stand
// clear of every other block, and still be solid to drive into.
const marks = await page.evaluate(() => {
  const grid = game.session.city.grid;
  const out = [];
  for (const { kind, cell } of game.config.CITY.landmarks) {
    const index = cell[0] * grid + cell[1];
    const block = game.session.blocks[index];
    const [x, z] = game.session.city.blockCenters[index];
    const count = game.session.blocks.filter((b) => b.kind === kind).length;
    const c = game.session.car;
    // start on the street centre line north of it, pointing at it
    c.place(x, z + game.session.city.pitch / 2, 0);
    for (let i = 0; i < 240; i++) {
      game.testInput = { steer: 0, throttle: 1, brake: false };
      game.update(1 / 60);
    }
    const half = game.session.city.block / 2;
    out.push({
      kind, count, placed: block && block.kind === kind,
      height: game.assets.info(kind).size[2],
      inside: Math.abs(c.x - x) < half && Math.abs(c.z - z) < half,
    });
  }
  const tallest = Math.max(...['block_downtown', 'block_lowrise',
    'block_industrial', 'block_park', 'block_parking']
    .map((k) => game.assets.info(k).size[2]));
  return { marks: out, tallest };
});
console.log('   landmarks:', JSON.stringify(marks));
check('every landmark is at its named cell', marks.marks.every((m) => m.placed),
      marks.marks.map((m) => m.kind).join(', '));
check('each landmark is one of a kind', marks.marks.every((m) => m.count === 1));
check('landmarks are solid', marks.marks.every((m) => !m.inside));
check('the tower stands above the skyline',
      marks.marks.find((m) => m.kind === 'block_tower').height > marks.tallest + 20,
      marks.marks.find((m) => m.kind === 'block_tower').height + ' m vs ' + marks.tallest);

// The minimap has to show them, or a landmark only helps once you can
// already see it.
const marked = await page.evaluate(() => {
  const grid = game.session.city.grid;
  const cell = game.config.CITY.landmarks[0].cell;
  const index = cell[0] * grid + cell[1];
  return { landmark: game.minimap.blockColors[index],
           plain: game.minimap.blockColors.find((_, i) =>
             game.session.blocks[i].kind === 'block_downtown') };
});
check('landmarks stand out on the minimap',
      !!marked.landmark && marked.landmark !== marked.plain,
      JSON.stringify(marked));

// Shadows: on by default, and the shadow box tracks the car.
const shadows = await page.evaluate(() => {
  const s = game.session, c = s.car;
  game.setShadows(true);
  c.place(120, -80, 0);
  for (let i = 0; i < 30; i++) {
    game.testInput = { steer: 0, throttle: 0, brake: false };
    game.update(1/60);
  }
  const tracking = Math.hypot(s.sun.target.position.x - c.x,
                              s.sun.target.position.z - c.z);
  const casters = [];
  s.car.model.traverse((n) => { if (n.isMesh) casters.push(n.castShadow); });
  game.setShadows(false);
  const off = game.renderer.shadowMap.enabled;
  game.setShadows(true);
  return { enabled: game.renderer.shadowMap.enabled, off,
           tracking: +tracking.toFixed(2),
           carCasts: casters.length > 0 && casters.every(Boolean) };
});
console.log('   shadows:', JSON.stringify(shadows));
check('shadows can be switched off and on', shadows.enabled && !shadows.off);
check('the shadow box follows the car', shadows.tracking < 1, shadows.tracking + ' m');
check('the car casts a shadow', shadows.carCasts);

// Minimap: tapping switches between the zoomed view and the whole city.
const map = await page.evaluate(() => {
  const m = game.minimap;
  m.setMode('follow');
  const near = m.scale;
  m.setMode('full');
  const far = m.scale;
  m.setMode('follow');
  // in follow mode the car sits in the middle whatever its world position
  game.session.car.place(180, -140, 0);
  m.draw(game.session.car, game.session.coins, game.session.mission,
         game.session.traffic.cars);
  const [px, py] = m.toScreen(180, -140);
  return { near: +near.toFixed(4), far: +far.toFixed(4),
           centred: Math.abs(px - m.centre) < 0.01 && Math.abs(py - m.centre) < 0.01 };
});
console.log('   minimap:', JSON.stringify(map));
check('the minimap zooms in and out', map.near > map.far * 1.5);
check('the zoomed minimap keeps the car centred', map.centred);

// Jobs come in three shapes, and a multi-stop job is not done until every
// stop has been reached.
const jobs = await page.evaluate(() => {
  const s = game.session, c = s.car;
  for (const coin of s.coins) { coin.taken = true; coin.object.visible = false; }

  // start from a fresh job: whatever the tests above left behind may already
  // be part-way through its stops, and this check is about a job run whole
  s.newMission();

  const seen = {};
  const runs = [];
  for (let n = 0; n < 40; n += 1) {
    const job = s.mission;
    if (!job) break;
    seen[job.type] = (seen[job.type] || 0) + 1;
    const before = s.stats.coins;
    const stops = job.stops.length;

    // stopping short of the last stop must not pay
    for (let i = 0; i < stops - 1; i += 1) {
      c.place(s.mission.x, s.mission.z + 2, 0);
      game.update(1 / 60);
    }
    const partial = s.stats.coins - before;

    c.place(s.mission.x, s.mission.z + 2, 0);
    game.update(1 / 60);
    runs.push({ type: job.type, stops, pay: job.pay, partial,
                earned: s.stats.coins - before });
  }
  s.scatterCoins(s.city.streetLines, s.city.halfExtent - 14);
  return { seen, runs };
});
const kinds = Object.keys(jobs.seen);
const multi = jobs.runs.filter((run) => run.stops > 1);
console.log('   jobs:', JSON.stringify(jobs.seen),
            JSON.stringify(jobs.runs.slice(0, 3)));
check('all three job types come up', kinds.length === 3, kinds.join(', '));
check('every job pays at least its fee',
      jobs.runs.every((run) => run.earned >= run.pay));
check('a multi-stop job pays nothing until the last stop',
      multi.length > 0 && multi.every((run) => run.partial === 0),
      multi.length + ' multi-stop jobs');
check('longer jobs are worth more',
      Math.max(...jobs.runs.filter((r) => r.stops > 2).map((r) => r.pay))
      > Math.max(...jobs.runs.filter((r) => r.stops === 1).map((r) => r.pay)));

// The van trades speed for delivery income; that has to actually pay out.
const van = await page.evaluate(() => {
  const s = game.session, c = s.car;
  const fee = 1000;
  const collect = (multiplier) => {
    s.car.spec.payMultiplier = multiplier;
    s.mission = { type: 'delivery', stops: [{ x: 0, z: 0 }], stopIndex: 0,
                  x: 0, z: 0, pay: fee, bonus: 0, limit: 99, left: 99,
                  expired: false };
    const before = s.stats.coins;
    c.place(0, 2, 0);
    game.update(1 / 60);
    return s.stats.coins - before;
  };
  const plain = collect(1);
  const loaded = collect(1.35);
  s.car.spec.payMultiplier = 1;
  return { plain, loaded };
});
console.log('   van pay:', JSON.stringify(van));
check('the van multiplier reaches the payout',
      van.loaded === Math.round(van.plain * 1.35), JSON.stringify(van));

// Night is a real lighting change, not just a darker sky.
const night = await page.evaluate(() => {
  const s = game.session;
  s.setTimeOfDay('day');
  const day = { fog: Math.round(s.scene.fog.far),
                beams: !!(s.car.beams && s.car.beams.visible) };
  s.setTimeOfDay('night');
  const dark = { fog: Math.round(s.scene.fog.far),
                 beams: !!(s.car.beams && s.car.beams.visible) };
  s.setTimeOfDay('dusk');
  return { day, dark, backToDusk: s.timeOfDay };
});
console.log('   night:', JSON.stringify(night));
check('night turns the headlights on', night.dark.beams && !night.day.beams);
check('night pulls the fog in', night.dark.fog < night.day.fog,
      `${night.dark.fog} vs ${night.day.fog}`);
check('the lighting can be switched back', night.backToDusk === 'dusk');

const perf = await page.evaluate(() => {
  const s = game.session, c = s.car;
  c.place(s.city.streetLines[3] + s.city.laneOffsets[0], 150, 0);
  s.traffic.reset(c.x, c.z);
  for (let i = 0; i < 240; i++) {
    game.testInput = { steer: 0, throttle: 1, brake: false };
    game.update(1/60);
  }
  // render once here rather than trusting whatever the last animation frame
  // happened to draw -- under software GL that can be a menu frame
  game.renderer.render(s.scene, game.camera);
  return { calls: game.renderer.info.render.calls,
           tris: game.renderer.info.render.triangles };
});
console.log('   render while driving:', JSON.stringify(perf));
check('draw calls phone-friendly', perf.calls > 30 && perf.calls < 400, perf.calls+'');

// kerb collision: aim straight at a block. It has to be a solid one -- car
// parks are meant to be driveable, and which cells they land on moves with
// the map seed.
const bump = await page.evaluate(() => {
  const s = game.session, c = s.car;
  const index = s.blocks.findIndex((block) => block.kind !== 'block_parking');
  const [bx, bz] = s.city.blockCenters[index];
  // one street north of it, pointing at it: heading 0 drives along -Z
  c.place(bx, bz + s.city.pitch / 2, 0);
  for (let i=0;i<240;i++) { game.testInput = { steer: 0, throttle: 1, brake: false }; game.update(1/60); }
  const half = s.city.block / 2;
  return { kind: s.blocks[index].kind, z: +c.z.toFixed(1),
           blockEdge: +(bz + half).toFixed(1), inside: Math.abs(c.z - bz) < half,
           speed: +c.speed.toFixed(1), bumped: c.bumped };
});
console.log('   kerb:', JSON.stringify(bump));
check('car cannot drive into a block', !bump.inside && bump.bumped);

// Damage: a crash costs you something beyond the speed you lose in it, and
// the garage is the only way to get it back.
const dents = await page.evaluate(() => {
  const s = game.session, c = s.car;
  const index = s.blocks.findIndex((block) => block.kind !== 'block_parking');
  const [bx, bz] = s.city.blockCenters[index];

  c.damage = 0;
  // creep into the kerb: too slow to count as a crash
  c.place(bx, bz + s.city.pitch / 2, 0);
  c.speed = 3;
  for (let i = 0; i < 120; i++) {
    game.testInput = { steer: 0, throttle: 0, brake: false };
    game.update(1/60);
  }
  const nudge = c.damage;

  // now drive into it properly
  c.place(bx, bz + s.city.pitch / 2, 0);
  const clean = c.topSpeed;
  for (let i = 0; i < 240; i++) {
    game.testInput = { steer: 0, throttle: 1, brake: false };
    game.update(1/60);
  }
  const crashed = c.damage;
  const slowed = c.topSpeed;

  c.damage = 0.5;
  const halfDead = c.topSpeed;
  c.repair();
  return { nudge: +nudge.toFixed(3), crashed: +crashed.toFixed(3),
           clean: +clean.toFixed(2), slowed: +slowed.toFixed(2),
           halfDead: +halfDead.toFixed(2), afterRepair: c.damage };
});
console.log('   damage:', JSON.stringify(dents));
check('a kerb at walking pace is not a crash', dents.nudge === 0, dents.nudge + '');
check('driving into a building damages the car', dents.crashed > 0.02,
      dents.crashed + '');
check('damage costs top speed', dents.halfDead < dents.clean,
      `${dents.halfDead} vs ${dents.clean}`);
check('repairs undo it', dents.afterRepair === 0);

// The garage charges for the repair, and will not do it for free.
const bill = await page.evaluate(async () => {
  const before = JSON.parse(localStorage.getItem('dortyol.profile.v1'));
  game.session.car.damage = 0.6;
  game.pause();                      // banking is what writes damage out
  const saved = JSON.parse(localStorage.getItem('dortyol.profile.v1'));
  return { savedDamage: saved.damage && saved.damage[game.session.car.spec.id],
           coinsBefore: before.coins };
});
console.log('   repair bill:', JSON.stringify(bill));
check('damage is banked with the run', bill.savedDamage > 0.5,
      bill.savedDamage + '');
await page.click('#btn-resume');
await page.waitForTimeout(250);

// Police: reckless driving fills the heat meter, a patrol turns up, and it
// costs money if it catches you.
const chase = await page.evaluate(() => {
  const s = game.session, c = s.car;
  const police = s.police;
  police.reset();
  const calm = police.heat;

  // A spell of speeding, from one end of the map to the other: the meter
  // takes about twelve seconds to fill and the car covers 40 m of street a
  // second, so it needs the full run to get there without hitting the wall.
  c.place(s.city.streetLines[3] + s.city.laneOffsets[0],
          s.city.halfExtent - 40, 0);
  c.speed = 40;
  for (let i = 0; i < 60 * 20 && !police.wanted; i++) {
    c.speed = Math.max(c.speed, 40);
    game.testInput = { steer: 0, throttle: 1, brake: false };
    game.update(1/60);
  }
  const dispatched = police.wanted;
  const at = police.position;
  const gapAtStart = at
    ? Math.round(Math.hypot(at.x - c.x, at.z - c.z)) : null;

  // stand still and let them arrive
  let closest = gapAtStart;
  let busted = false;
  const coinsBefore = s.stats.coins = 4000;
  // Coast to a stop rather than holding the brake -- held past a standstill
  // the brake reverses the car, and you are not caught while still moving.
  for (let i = 0; i < 60 * 60 && !busted; i++) {
    game.testInput = { steer: 0, throttle: 0, brake: false };
    game.update(1/60);
    const now = police.position;
    if (now) {
      closest = Math.min(closest,
                         Math.round(Math.hypot(now.x - c.x, now.z - c.z)));
    }
    busted = s.stats.busts > 0;
  }
  return { calm, dispatched, gapAtStart, closest, busted,
           fine: coinsBefore - s.stats.coins, heatAfter: police.heat,
           coins: s.stats.coins };
});
console.log('   chase:', JSON.stringify(chase));
check('the heat meter starts empty', chase.calm === 0);
check('speeding brings out a patrol car', chase.dispatched);
check('the patrol closes in on the car', chase.closest < chase.gapAtStart,
      `${chase.closest} m from ${chase.gapAtStart} m`);
check('being caught costs a fine', chase.busted && chase.fine > 0,
      chase.fine + ' coins');
check('the heat clears once it is settled', chase.heatAfter === 0);

// ...and outrunning them ends it without a fine.
const escape = await page.evaluate(() => {
  const s = game.session, c = s.car;
  const police = s.police;
  police.reset();
  police.heat = 1;
  police.update(1/60, c);                       // dispatches
  const dispatched = police.wanted;
  const before = s.stats.coins;
  // teleport away and hold: the chase gives up after loseTime seconds
  let escaped = false;
  for (let i = 0; i < 60 * 30 && !escaped; i++) {
    c.place(-s.city.halfExtent + 30, -s.city.halfExtent + 30, 0);
    c.speed = 0;
    game.testInput = { steer: 0, throttle: 0, brake: false };
    game.update(1/60);
    escaped = !police.wanted;
  }
  return { dispatched, escaped, charged: before - s.stats.coins };
});
console.log('   escape:', JSON.stringify(escape));
check('a patrol can be outrun', escape.dispatched && escape.escaped);
check('outrunning them costs nothing', escape.charged === 0);

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
  const start = { coins: s.stats.coins, deliveries: s.stats.deliveries };
  const first = { x: s.mission.x, z: s.mission.z, pay: s.mission.pay };
  // a job with several stops only pays at the last one, so see each job
  // through to the end rather than assuming a single drop
  const finish = () => {
    for (let n = s.mission.stops.length; n > 0; n -= 1) {
      c.place(s.mission.x, s.mission.z + 2, 0);
      game.update(1/60);
    }
  };
  finish();
  const paid = s.stats.coins - start.coins;
  const moved = s.mission.x !== first.x || s.mission.z !== first.z;
  finish();
  return { swept, pay: first.pay, paid, moved,
           deliveries: s.stats.deliveries - start.deliveries };
});
console.log('   free roam:', JSON.stringify(loop));
check('coins are collectable while driving', loop.swept > 0, loop.swept+'');
check('delivery pays out', loop.paid >= loop.pay, `${loop.paid} for a ${loop.pay} fee`);
check('a new delivery is issued', loop.moved && loop.deliveries === 2);
await page.screenshot({ path: SHOTS+'/c3-city.png' });

// coins are banked to the profile
const owed = await page.evaluate(() => game.session.stats.coins);
await page.click('#btn-pause'); await page.waitForTimeout(250);
const banked = await page.evaluate(() => JSON.parse(localStorage.getItem('dortyol.profile.v1')).coins);
check('earnings are banked on pause', banked >= owed, `${banked} banked for ${owed} earned`);
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
