/**
 * What every browser suite shares: a browser, a page that has booted to the
 * title screen, and a pass/fail tally that fails on any page error.
 */

import { chromium } from 'playwright';

export const BASE = (process.env.GAME_URL || 'http://127.0.0.1:8000') + '/index.html';
export const SHOTS = process.env.SHOT_DIR || '.test-shots';

let failures = 0;
const problems = [];

export function check(name, ok, extra = '') {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
}

export async function launch() {
  return chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
           '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
}

/**
 * Open the game and wait for the title screen.
 * @param {string} query  e.g. '?portal=fake&seed=3'
 * @param {object} [options] viewport, locale, init (a script run before the page)
 */
export async function open(browser, query = '?portal=fake&seed=3', options = {}) {
  const page = await browser.newPage({
    viewport: options.viewport || { width: 390, height: 844 },
    locale: options.locale || 'en-US',
    hasTouch: true,
    isMobile: !!options.mobile,
  });
  // Software rendering is slow here; give actionability checks room.
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('CONSOLE ' + m.text());
  });
  if (options.init) await page.addInitScript(options.init);
  await page.goto(BASE + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.glowfly && window.glowfly.game.state === 'title',
                             { timeout: 60000 });
  await page.evaluate(() => { window.glowfly.portal.fake.seconds = 0.1; });
  return page;
}

export function visible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden'
      && !el.closest('.is-hidden') && el.getClientRects().length > 0;
  }, selector);
}

/** Wait for an ad round-trip to finish and the curtain to lift. */
export function adDone(page) {
  return page.waitForFunction(
    () => !window.glowfly.portal.isAdActive()
      && !document.getElementById('curtain').classList.contains('is-visible'),
    { timeout: 20000 });
}

export function finish() {
  if (problems.length) {
    failures += 1;
    console.log('JS PROBLEMS:\n' + problems.slice(0, 8).join('\n'));
  } else {
    console.log('PASS  no console/page errors');
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}
