/**
 * screenshots.mjs -- Play Store screenshots, taken from the real game.
 *
 *     npm run serve &
 *     node tools/screenshots.mjs
 *
 * Shots are composed by driving the simulation to a known state rather than by
 * playing until something photogenic happens, so re-running this produces the
 * same pictures. Rendered at 1080x1920 (and 1920x1080) by using a phone-sized
 * viewport at 3x device pixel ratio, which is what a real phone screenshot is.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = (process.env.GAME_URL || 'http://localhost:8000') + '/index.html';
const OUT = process.env.SHOT_DIR || 'store/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
         '--disable-dev-shm-usage'],
});

async function open({ width, height, locale = 'tr-TR', coins = 26000 }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 3,
    locale,
    hasTouch: true,
    isMobile: true,
  });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.getElementById('screen-menu')?.classList.contains('is-visible'),
    { timeout: 120000 });
  // A store screenshot should show a garage worth looking at, not an empty one.
  await page.evaluate((amount) => {
    const key = 'dortyol.profile.v1';
    const profile = JSON.parse(localStorage.getItem(key) || '{}');
    profile.coins = amount;
    profile.owned = ['sport', 'muscle', 'super'];
    profile.seen = { 'tutorial.city': true, 'tutorial.rush': true };
    localStorage.setItem(key, JSON.stringify(profile));
  }, coins);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    () => document.getElementById('screen-menu')?.classList.contains('is-visible'),
    { timeout: 120000 });
  return page;
}

/**
 * Click without Playwright's actionability wait.
 *
 * The menu runs the full 3D scene behind it, and under software rendering the
 * main thread is slow enough that the "element is stable across two frames"
 * check can outlast the default timeout. Nothing here is testing whether the
 * button is clickable -- the test suites do that -- so dispatch it directly.
 */
async function tap(page, selector) {
  await page.$eval(selector, (el) => el.click());
  await page.waitForTimeout(250);
}

/** Put the car somewhere specific and let the world settle around it. */
async function pose(page, script, frames = 200) {
  await page.evaluate(({ body, count }) => {
    // eslint-disable-next-line no-new-func
    new Function('game', 's', 'c', body)(window.game, window.game.session,
                                         window.game.session.car);
    for (let i = 0; i < count; i += 1) {
      game.testInput = { steer: 0, throttle: 1, brake: false };
      game.update(1 / 60);
    }
    game.testInput = { steer: 0, throttle: 0, brake: false };
  }, { body: script, count: frames });
  await page.waitForTimeout(900);
}

const CITY = `
  const line = s.city.streetLines[3];
  c.place(line + s.city.laneOffsets[0], 120, 0);
  s.traffic.reset(c.x, c.z);
  s.pedestrians.reset(c.x, c.z);
`;
const JUNCTION = `
  s.signals.set(3, 0.6);
  const line = s.city.streetLines[3];
  c.place(line + s.city.laneOffsets[0], 46, 0);
  c.speed = 0;
  s.traffic.cars.forEach((car, i) => {
    car.axis = 'x'; car.dir = 1; car.line = s.city.streetLines[3];
    car.lane = i % 2 ? s.city.laneOffsets[0] : s.city.laneOffsets[1];
    car.along = line - 16 - Math.floor(i / 2) * 9;
    car.cruise = 12; car.speed = 5; car.turn = null; car.plan = null;
    s.traffic.applyTransform(car);
  });
`;
const LOT = `
  const lot = s.blocks.find((b) => b.kind === 'block_parking');
  c.place(lot.x - 4, lot.z + 6, -Math.PI / 2);
  c.speed = 0;
`;

const shots = [
  { name: '1-city', size: { width: 360, height: 640 }, script: CITY, frames: 260 },
  { name: '2-junction', size: { width: 360, height: 640 }, script: JUNCTION, frames: 340 },
  { name: '3-car-park', size: { width: 360, height: 640 }, script: LOT, frames: 60 },
  { name: '6-landscape', size: { width: 640, height: 360 }, script: CITY, frames: 260 },
];

for (const shot of shots) {
  const page = await open(shot.size);
  await tap(page, '#btn-play-city');
  await page.waitForTimeout(400);
  await pose(page, shot.script, shot.frames);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(shot.name);
  await page.close();
}

// Garage, with everything unlocked so the parts and paints are visible.
{
  const page = await open({ width: 360, height: 640 });
  await tap(page, '#btn-garage');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/4-garage.png` });
  console.log('4-garage');
  await page.close();
}

// Highway mode.
{
  const page = await open({ width: 360, height: 640 });
  await tap(page, '#btn-play-highway');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    for (let i = 0; i < 60 * 14; i += 1) {
      const p = game.session.player;
      let best = p.x, bestGap = -1;
      for (const lane of game.session.lanes) {
        let gap = 400;
        for (const car of game.session.traffic.active) {
          if (Math.abs(car.holder.position.x - lane) > 2) continue;
          const d = p.z - car.holder.position.z;
          if (d > 0 && d < gap) gap = d;
        }
        gap -= Math.abs(lane - p.x) * 6;
        if (gap > bestGap) { bestGap = gap; best = lane; }
      }
      game.testInput = { steer: Math.max(-1, Math.min(1, (best - p.x) * 1.4)),
                         throttle: 1, brake: false };
      game.update(1 / 60);
      if (game.session.over) break;
      const close = game.session.traffic.active.some((car) => {
        const d = p.z - car.holder.position.z;
        return d > 20 && d < 50;
      });
      if (close && i > 60 * 6) break;
    }
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/5-highway.png` });
  console.log('5-highway');
  await page.close();
}

await browser.close();
console.log('screenshots in ' + OUT);
