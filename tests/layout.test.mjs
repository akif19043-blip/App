/**
 * Layout tests across orientations and screen sizes.
 *
 *     node tests/layout.test.mjs
 *
 * The game is played on whatever the phone is doing at the time, so every
 * screen has to fit and the touch controls have to stay inside the viewport
 * and clear of the readouts -- in portrait, in landscape, and on a tablet.
 * These are pure DOM measurements; no simulation is stepped.
 */

import { chromium } from 'playwright';

const SHOTS = process.env.SHOT_DIR || '.test-shots';

const VIEWPORTS = [
  { name: 'small phone portrait', width: 360, height: 640 },
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'big phone landscape', width: 932, height: 430 },
  { name: 'tablet portrait', width: 820, height: 1180 },
  { name: 'tablet landscape', width: 1180, height: 820 },
];

const SCREENS = ['menu', 'garage', 'records', 'settings', 'paused', 'over'];
const CONTROLS = ['#btn-left', '#btn-right', '#btn-brake', '#btn-gas', '#btn-nitro'];

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
         '--disable-dev-shm-usage'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
});
// Software rendering here manages a handful of frames per second, and
// Playwright's actionability checks want the element stable across frames.
// Give them room rather than skipping the check -- whether a button is
// actually clickable is part of what these suites verify.
page.setDefaultTimeout(60000);
const problems = [];
page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));

await page.goto((process.env.GAME_URL || 'http://localhost:8000') + '/index.html',
                { waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('screen-menu')?.classList.contains('is-visible'),
  { timeout: 120000 });

// Populate the garage first. Its panel is only as tall as its contents, and
// those are built on demand -- measuring it empty would prove nothing.
await page.evaluate(() => {
  const key = 'dortyol.profile.v1';
  const profile = JSON.parse(localStorage.getItem(key) || '{}');
  profile.coins = 50000;
  localStorage.setItem(key, JSON.stringify(profile));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('screen-menu')?.classList.contains('is-visible'),
  { timeout: 120000 });
await page.click('#btn-garage');
await page.waitForTimeout(300);
const populated = await page.evaluate(() => ({
  cards: document.querySelectorAll('.car-card').length,
  parts: document.querySelectorAll('.tune__row').length,
  paints: document.querySelectorAll('.tune__paint').length,
}));
check('garage is populated before measuring',
      populated.cards > 0 && populated.parts > 0 && populated.paints > 0,
      JSON.stringify(populated));
await page.click('#btn-garage-back');
await page.waitForTimeout(150);

// Records is built on demand too, and the rank ladder is the tallest thing
// in it -- measuring it closed would prove nothing either.
await page.click('#btn-records');
await page.waitForTimeout(300);
const records = await page.evaluate(() => ({
  rows: document.querySelectorAll('.records__row').length,
  ranks: document.querySelectorAll('.records__rank').length,
}));
check('records is populated before measuring',
      records.rows > 0 && records.ranks > 0, JSON.stringify(records));
await page.click('#btn-records-back');
await page.waitForTimeout(150);

// Get into the city so the HUD and controls are live and measurable.
await page.click('#btn-play-city');
await page.waitForTimeout(400);

for (const viewport of VIEWPORTS) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(350);

  const report = await page.evaluate((names) => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height,
               right: box.right, bottom: box.bottom };
    };
    const overlaps = (a, b) => !!a && !!b
      && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;

    // Every screen must fit without the panel running off the bottom.
    const screens = {};
    const visible = [...document.querySelectorAll('.screen.is-visible')]
      .map((el) => el.id);
    for (const name of names) {
      const el = document.getElementById('screen-' + name);
      el.classList.add('is-visible');
      screens[name] = {
        overflow: el.scrollHeight > el.clientHeight + 1,
        panel: Math.round(el.querySelector('.panel').getBoundingClientRect().height),
        view: el.clientHeight,
      };
      el.classList.remove('is-visible');
    }
    for (const id of visible) document.getElementById(id).classList.add('is-visible');

    const controls = {};
    for (const selector of ['#btn-left', '#btn-right', '#btn-brake',
                            '#btn-gas', '#btn-nitro']) {
      controls[selector] = rect(selector);
    }
    const speed = rect('.hud__speed');
    const minimap = rect('#minimap');
    const pause = rect('#btn-pause');
    const nitroBar = rect('.hud__nitro');
    const meters = rect('.hud__meters');

    const clashes = [];
    for (const [selector, box] of Object.entries(controls)) {
      if (!box) continue;
      if (overlaps(box, speed)) clashes.push(selector + ' over speed');
      if (overlaps(box, minimap)) clashes.push(selector + ' over minimap');
      if (overlaps(box, nitroBar)) clashes.push(selector + ' over nitro bar');
      if (overlaps(box, meters)) clashes.push(selector + ' over the meters');
    }
    if (overlaps(minimap, pause)) clashes.push('minimap over pause');
    if (overlaps(minimap, meters)) clashes.push('minimap over the meters');

    const outside = Object.entries(controls)
      .filter(([, box]) => box && (box.x < 0 || box.y < 0
        || box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5))
      .map(([selector]) => selector);

    return { screens, clashes, outside,
             fov: +game.camera.fov.toFixed(1), rig: game.rigScale };
  }, SCREENS);

  const label = `${viewport.name} (${viewport.width}x${viewport.height})`;
  const overflowing = Object.entries(report.screens)
    .filter(([, info]) => info.overflow).map(([name]) => name);

  check(`${label}: every screen fits`, overflowing.length === 0,
        overflowing.length ? 'overflowing: ' + overflowing.join(', ') : '');
  check(`${label}: controls stay on screen`, report.outside.length === 0,
        report.outside.join(', '));
  check(`${label}: controls clear of the readouts`, report.clashes.length === 0,
        report.clashes.join(', '));

  const portrait = viewport.height > viewport.width;
  check(`${label}: camera rig matches the orientation`,
        portrait ? report.rig === 1 : report.rig < 1, `rig ${report.rig}`);

  await page.screenshot({
    path: `${SHOTS}/layout-${viewport.width}x${viewport.height}.png`,
  });
}

await browser.close();
if (problems.length) {
  failures += 1;
  console.log(problems.join('\n'));
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
