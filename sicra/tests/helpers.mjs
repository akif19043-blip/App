/** Shared Playwright setup for the suites. */

import { chromium } from 'playwright';

export const SHOTS = process.env.SHOT_DIR || '.test-shots';
export const URL = process.env.GAME_URL || 'http://localhost:8124';

let failures = 0;
export const check = (name, ok, extra = '') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};
export const failed = () => failures;

export async function launch(viewport = { width: 390, height: 844 }) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
           '--disable-dev-shm-usage', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  return { browser, page, errors };
}

/** Open the game and wait until the test hook exists. */
export async function open(page, params = '') {
  await page.goto(URL + '/index.html' + params);
  await page.waitForFunction(() => window.__sicra && window.__sicra.state === 'menu', null, { timeout: 30000 });
}

/** Advance the simulation by `seconds` with fixed steps (no real time). */
export async function advance(page, seconds, dt = 1 / 120) {
  await page.evaluate(({ seconds, dt }) => {
    const n = Math.round(seconds / dt);
    window.__sicra.step(dt, n);
  }, { seconds, dt });
}

export async function snapshot(page) {
  return page.evaluate(() => {
    const g = window.__sicra;
    return {
      state: g.state,
      x: g.player.x, y: g.player.y, z: g.player.z, lane: g.player.lane,
      grounded: g.player.grounded, sliding: g.player.sliding > 0, flying: g.player.flying,
      dead: g.player.dead, coins: g.run.coins, distance: g.run.distance, score: g.run.score,
      power: { ...g.player.power }, stats: { ...g.player.stats }, near: g.run.nearMisses,
    };
  });
}
