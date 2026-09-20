/**
 * What every suite needs before it can test anything.
 *
 * All four suites open the same game in the same headless browser and want
 * the same things from it: a Chromium that renders without a GPU, a page that
 * reports the browser's own complaints instead of swallowing them, a wait
 * until the menu is actually up, and a PASS/FAIL line per claim.
 *
 * That preamble used to be copied into each suite, which meant four slightly
 * different versions of it -- three different timeouts for the same wait, and
 * one suite that watched for page errors but not console errors, so a console
 * error there went unnoticed. One copy, one set of numbers, and a suite that
 * starts at its first real assertion.
 */

import { chromium } from 'playwright';

const URL = (process.env.GAME_URL || 'http://localhost:8000') + '/index.html';

/** Run artefacts, not docs: the runner makes the directory and empties it. */
export const SHOTS = process.env.SHOT_DIR || '.test-shots';

/**
 * How long the menu may take to appear.
 *
 * A cold load builds the city, and software rendering manages a handful of
 * frames per second, so this is slow the first time and instant afterwards.
 * It is generous on purpose: a timeout here means "the game never started",
 * which is worth waiting two minutes to be sure of.
 */
const READY = 120000;

/**
 * How long a click may wait for its target to settle.
 *
 * Playwright's actionability checks want an element stable across frames, and
 * at four frames per second that takes a while. Give them room rather than
 * skipping the check -- whether a button is clickable is part of the test.
 */
const ACTION = 60000;

/** The menu being up is what "loaded" means; nothing before it is testable. */
const menuIsUp = () => (
  document.getElementById('screen-menu')?.classList.contains('is-visible'));

/**
 * Launch a browser and return the tools a suite works with.
 *
 * @returns {Promise<{
 *   browser: import('playwright').Browser,
 *   open: (options?: {locale?: string, width?: number, height?: number})
 *     => Promise<import('playwright').Page>,
 *   reload: (page: import('playwright').Page)
 *     => Promise<import('playwright').Page>,
 *   check: (name: string, ok: boolean, extra?: string) => void,
 *   problems: string[],
 *   finish: () => Promise<never>,
 * }>}
 */
export async function harness() {
  const problems = [];
  let failures = 0;

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
           '--disable-dev-shm-usage'],
  });

  /** One line per claim, and a count of the ones that did not hold. */
  const check = (name, ok, extra = '') => {
    if (!ok) failures += 1;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
  };

  /** A phone-shaped page with the game loaded and the menu up. */
  async function open({ locale, width = 390, height = 844 } = {}) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      ...(locale ? { locale } : {}),
    });
    page.setDefaultTimeout(ACTION);
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push('CONSOLE ' + m.text());
    });
    page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(menuIsUp, { timeout: READY });
    return page;
  }

  /** Reload and wait again -- what a suite does after writing to storage. */
  async function reload(page) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(menuIsUp, { timeout: READY });
    return page;
  }

  /**
   * Close up and exit with the right code.
   *
   * A console error the suite never asserted on still fails the run: the game
   * throwing where nobody looked is exactly the bug a browser test is for.
   */
  async function finish() {
    await browser.close();
    if (problems.length) {
      failures += 1;
      console.log('JS PROBLEMS:\n' + problems.slice(0, 8).join('\n'));
    } else {
      console.log('PASS  no console/page errors');
    }
    console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
    process.exit(failures ? 1 : 0);
  }

  return { browser, open, reload, check, problems, finish };
}
