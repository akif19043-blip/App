/**
 * Shell tests: language detection and switching, settings persistence,
 * shop purchases, missions, progress reset.
 *
 *     node tests/shell.test.mjs
 */

import { chromium } from 'playwright';
import { URL, SHOTS, check, failed } from './helpers.mjs';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});

async function fresh(locale) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(URL + '/index.html');
  await page.waitForFunction(() => window.__sicra && window.__sicra.state === 'menu', null, { timeout: 30000 });
  return { context, page, errors };
}

// Language follows the device.
{
  const { context, page } = await fresh('en-US');
  const play = await page.textContent('#btn-play');
  check('English device gets English UI', play.trim() === 'RUN', play);
  await context.close();
}
{
  const { context, page, errors } = await fresh('tr-TR');
  const play = await page.textContent('#btn-play');
  check('Turkish device gets Turkish UI', play.trim() === 'KOŞ', play);

  // Switch language in settings; it sticks after reload.
  await page.click('#btn-settings');
  await page.selectOption('#set-language', 'en');
  const title = await page.textContent('#screen-settings h2');
  check('language switch retranslates immediately', title.trim() === 'SETTINGS', title);
  await page.click('#set-sound');
  const soundOff = await page.getAttribute('#set-sound', 'aria-pressed');
  check('sound toggle flips', soundOff === 'false');
  await page.selectOption('#set-quality', 'low');
  await page.reload();
  await page.waitForFunction(() => window.__sicra && window.__sicra.state === 'menu');
  const after = await page.evaluate(() => ({ lang: document.documentElement.lang, settings: window.__sicra.profile.settings }));
  check('settings survive a reload', after.lang === 'en' && after.settings.sound === false && after.settings.quality === 'low', JSON.stringify(after));
  await page.screenshot({ path: `${SHOTS}/shell-menu-en.png` });

  // Shop: cannot buy without coins, can with; selection changes the runner.
  await page.evaluate(() => { window.__sicra.profile.coins = 100; window.__sicra.save(); });
  await page.click('#btn-shop');
  const cards = await page.$$('#shop-characters .card');
  check('shop lists every character', cards.length === 6, 'cards=' + cards.length);
  await page.click('#shop-characters .card[data-id="deniz"] button');
  let state = await page.evaluate(() => ({ coins: window.__sicra.profile.coins, owned: window.__sicra.profile.owned, toast: document.getElementById('toast').textContent }));
  check('too poor: purchase refused with a toast', state.coins === 100 && !state.owned.includes('deniz') && /coins/i.test(state.toast), JSON.stringify(state));
  await page.evaluate(() => { window.__sicra.profile.coins = 1000; window.__sicra.ui.renderShop(); });
  await page.click('#shop-characters .card[data-id="deniz"] button');
  state = await page.evaluate(() => ({ coins: window.__sicra.profile.coins, owned: window.__sicra.profile.owned, character: window.__sicra.profile.character, model: window.__sicra.player.characterId }));
  check('buying a character deducts coins and selects it', state.coins === 700 && state.owned.includes('deniz') && state.character === 'deniz' && state.model === 'deniz', JSON.stringify(state));
  await page.click('#shop-characters .card[data-id="ekin"] button');
  state = await page.evaluate(() => window.__sicra.profile.character);
  check('selecting an owned character switches back', state === 'ekin');

  await page.click('.upgrade[data-kind="magnet"] button');
  state = await page.evaluate(() => ({ coins: window.__sicra.profile.coins, level: window.__sicra.profile.upgrades.magnet }));
  check('upgrading the magnet costs 120 and raises the level', state.coins === 580 && state.level === 2, JSON.stringify(state));
  await page.screenshot({ path: `${SHOTS}/shell-shop.png` });
  await page.click('#btn-shop-back');

  // Missions: three active, progress from a run, payout on completion.
  await page.click('#btn-missions');
  const missionCount = await page.$$eval('#missions-list .mission', (els) => els.length);
  check('three missions are active', missionCount === 3);
  await page.screenshot({ path: `${SHOTS}/shell-missions.png` });
  await page.click('#btn-missions-back');

  const mission = await page.evaluate(() => {
    const g = window.__sicra;
    // force a known mission set: jumps 15, coinsRun 30, distanceRun 300
    g.profile.missions.active = [
      { type: 'jumps', tier: 0, target: 15, progress: 0, scope: 'run', stat: 'jumps', done: false },
      { type: 'coinsRun', tier: 0, target: 30, progress: 0, scope: 'run', stat: 'coins', done: false },
      { type: 'distanceRun', tier: 0, target: 300, progress: 0, scope: 'run', stat: 'distance', done: false },
    ];
    g.profile.missions.completedSets = 0;
    const coinsBefore = g.profile.coins;
    g.setAuto(false);
    g.start(41);
    for (const o of g.track.obstacles) g.track.smash(o, false);
    g.player.stats.jumps = 15;
    g.run.coins = 30;
    g.run.distance = 300;
    g.step(1 / 120, 60);
    const toast = document.getElementById('hud-toast').textContent;
    g.finish();
    return {
      toast, coinsBefore, coinsAfter: g.profile.coins, sets: g.profile.missions.completedSets,
      active: g.profile.missions.active.map((m) => m.type), tiers: g.profile.missions.tiers, mult: g.run.multiplier,
    };
  });
  check('finishing missions toasts in-run and pays out', /Mission complete/.test(mission.toast) && mission.coinsAfter > mission.coinsBefore + 30, JSON.stringify(mission));
  check('a finished set deals three new missions and advances tiers', mission.sets === 1 && mission.active.length === 3 && mission.tiers.jumps === 1, JSON.stringify(mission));
  const mult = await page.evaluate(() => { window.__sicra.start(42); return window.__sicra.run.multiplier; });
  check('next run uses the raised multiplier', mult === 1.5, 'mult=' + mult);

  // Game over screen numbers.
  await page.evaluate(() => { const g = window.__sicra; g.start(43); g.run.coins = 12; g.run.distance = 250; g.player.kill('caught'); g.finish(); });
  const overText = await page.evaluate(() => ({
    score: document.getElementById('over-score').textContent,
    dist: document.getElementById('over-distance').textContent,
    coins: document.getElementById('over-coins').textContent,
  }));
  check('game-over shows score, distance and coins', overText.dist === '250 m' && overText.coins === '12' && overText.score !== '0', JSON.stringify(overText));
  await page.screenshot({ path: `${SHOTS}/shell-over.png` });

  // Reset wipes progress.
  page.once('dialog', (d) => d.accept());
  await page.click('#btn-over-menu');
  await page.click('#btn-settings');
  await page.click('#btn-reset');
  const reset = await page.evaluate(() => ({ coins: window.__sicra.profile.coins, best: window.__sicra.profile.best, state: window.__sicra.state, owned: window.__sicra.profile.owned.length }));
  check('reset clears coins, best and purchases', reset.coins === 0 && reset.best === 0 && reset.owned === 1 && reset.state === 'menu', JSON.stringify(reset));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed');
process.exit(failed() ? 1 : 0);
