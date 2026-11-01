/**
 * Rewarded-ad tests.
 *
 *     node tests/ads.test.mjs
 *
 * The real ads only exist inside the Android app, so these run the game with
 * `?ads=fake`: a stand-in back end that "plays" an ad and reports whether it
 * paid. Everything downstream of that answer -- which offers appear, what each
 * one pays, that nothing pays twice, that a run continued after a crash is
 * banked once -- is the real code a phone runs.
 *
 * The rules being checked are the ones that keep the ads honest: nothing is
 * offered without an ad in hand, nothing is paid for an ad not watched, and a
 * plain browser never sees an offer at all.
 */

import { chromium } from 'playwright';

const BASE = (process.env.GAME_URL || 'http://localhost:8000') + '/index.html';
const SHOTS = process.env.SHOT_DIR || '.test-shots';

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
const problems = [];

async function open(query = '?ads=fake') {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, locale: 'tr-TR',
    hasTouch: true, isMobile: true,
  });
  // Software rendering manages a handful of frames per second here; see
  // city.test.mjs for why the generous timeout rather than skipped checks.
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('CONSOLE ' + m.text());
  });
  await page.goto(BASE + query, { waitUntil: 'load' });
  await waitForMenu(page);
  // A short pretend ad: the suites wait on it, and nothing here is about
  // how long an ad is.
  await page.evaluate(() => { game.ads.fake.seconds = 0.15; });
  return page;
}

const waitForMenu = (page) => page.waitForFunction(
  () => document.getElementById('screen-menu')?.classList.contains('is-visible'),
  { timeout: 120000 });

const visible = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return !!el && !el.classList.contains('is-hidden')
    && getComputedStyle(el).display !== 'none';
}, selector);

/** Wait for a pretend ad to finish and the curtain to come down. */
const adDone = (page) => page.waitForFunction(
  () => !game.watching
    && !document.getElementById('ad-curtain').classList.contains('is-visible'),
  { timeout: 30000 });

// --- a plain browser offers nothing -----------------------------------------
{
  const page = await open('');
  const state = await page.evaluate(() => ({
    kind: game.ads.kind(), ready: game.ads.ready(),
  }));
  check('a plain browser has no ad back end', state.kind === 'none' && !state.ready,
        JSON.stringify(state));
  check('a plain browser shows no free-coins offer',
        !await visible(page, '#btn-ad-coins'));
  await page.close();
}

// --- menu: free coins --------------------------------------------------------
const page = await open();
{
  const before = await page.evaluate(() => ({
    kind: game.ads.kind(), coins: game.save.get().coins,
    amount: game.rewards.freeCoinsAmount(),
    label: document.getElementById('ad-coins-amount').textContent,
  }));
  check('the fake back end is picked from the URL', before.kind === 'fake');
  check('the menu offers free coins once an ad is loaded',
        await visible(page, '#btn-ad-coins'));
  check('the offer names its reward', before.label === '+' + before.amount
        && before.amount === 150, JSON.stringify(before));
  await page.screenshot({ path: SHOTS + '/ad-menu.png' });

  // Closed early: no reward, and the offer stays up for another go.
  await page.evaluate(() => { game.ads.fake.pays = false; });
  await page.click('#btn-ad-coins');
  await adDone(page);
  const unpaid = await page.evaluate(() => ({
    coins: game.save.get().coins,
    toast: document.getElementById('toast').textContent,
    watched: game.save.get().ads.watched,
  }));
  check('an ad closed early pays nothing', unpaid.coins === before.coins
        && unpaid.watched === 0, JSON.stringify(unpaid));
  check('and says so', /ödül yok/.test(unpaid.toast), unpaid.toast);
  check('and the offer is still there', await visible(page, '#btn-ad-coins'));

  await page.evaluate(() => { game.ads.fake.pays = true; });
  await page.click('#btn-ad-coins');
  await adDone(page);
  const paid = await page.evaluate(() => ({
    coins: game.save.get().coins,
    shown: document.getElementById('menu-coins').textContent,
  }));
  check('a watched ad pays the coins', paid.coins === before.coins + before.amount,
        JSON.stringify(paid));
  check('the menu balance updates', paid.shown === String(paid.coins), paid.shown);
  check('the offer goes away for its cooldown', !await visible(page, '#btn-ad-coins'));

  // The cooldown is in the profile, so a restart does not reset it...
  await page.reload({ waitUntil: 'load' });
  await waitForMenu(page);
  await page.evaluate(() => { game.ads.fake.seconds = 0.15; });
  check('the cooldown survives a restart', !await visible(page, '#btn-ad-coins'));
  // ...and claiming again inside it pays nothing even if asked directly.
  const early = await page.evaluate(() => game.rewards.claimFreeCoins());
  check('the bonus cannot be claimed inside its cooldown', early === 0);

  // Wind the clock past the cooldown: the offer comes back by itself.
  await page.evaluate(() => {
    const cooldown = 240 * 1000 + 1000;
    game.save.get().ads.claimed.coins = Date.now() - cooldown;
    game.hud.refreshMenu();
  });
  check('the offer returns after the cooldown', await visible(page, '#btn-ad-coins'));

  // No ad loaded, no offer: a button that does nothing is worse than none.
  await page.evaluate(() => game.ads.setFakeReady(false));
  check('no ad in hand means no offer', !await visible(page, '#btn-ad-coins'));
  await page.evaluate(() => game.ads.setFakeReady(true));
  check('the offer returns when an ad loads', await visible(page, '#btn-ad-coins'));

  // The bonus grows with rank, like every other fee.
  const scaled = await page.evaluate(() => [
    game.rewards.freeCoinsAmount(0), game.rewards.freeCoinsAmount(1e9)]);
  check('the bonus grows with rank', scaled[1] > scaled[0], scaled.join(' -> '));
}

// --- garage: free repair -----------------------------------------------------
{
  await page.evaluate(() => {
    const id = game.save.get().selectedCar;
    game.save.setDamage(id, 0.6);
    game.equip();
  });
  await page.click('#btn-garage');
  await page.waitForTimeout(250);
  const offered = await page.evaluate(() => ({
    paid: !!document.querySelector('[data-repair]'),
    free: !!document.querySelector('[data-ad-repair]'),
    coins: game.save.get().coins,
  }));
  check('a damaged car can be repaired for an ad', offered.free,
        JSON.stringify(offered));
  check('beside the paid repair, not instead of it', offered.paid);
  await page.screenshot({ path: SHOTS + '/ad-garage.png' });
  await page.click('[data-ad-repair]');
  await adDone(page);
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({
    damage: game.save.damageFor(game.save.get().selectedCar),
    coins: game.save.get().coins,
    driving: game.sessions.city.car.damage,
    rows: !!document.querySelector('[data-ad-repair]'),
  }));
  check('the ad repair fixes the car for nothing',
        after.damage === 0 && after.coins === offered.coins, JSON.stringify(after));
  check('the car on the road is fixed too', after.driving === 0);
  check('with nothing left to fix, nothing is offered', !after.rows);
  await page.click('#btn-garage-back');
  await page.waitForTimeout(150);
}

// --- city: get a fine back ---------------------------------------------------
{
  await page.click('#btn-play-city');
  await page.waitForTimeout(400);
  // The patrol's own pursuit is covered in city.test.mjs; here it only has
  // to report a catch, and everything from the fine onwards is the real path.
  const bust = await page.evaluate(() => {
    const s = game.session;
    s.stats.coins = 2000;
    const real = s.police.update.bind(s.police);
    s.police.update = () => {
      s.police.update = real;
      return { busted: true };
    };
    game.update(1 / 60);
    return { coins: s.stats.coins, fines: s.stats.fines };
  });
  await page.waitForTimeout(150);
  const fine = 2000 - bust.coins;
  check('being caught takes a fine', fine > 0, fine + ' coins');
  check('and offers it back for an ad', await visible(page, '#btn-ad-refund'));
  const label = await page.evaluate(
    () => document.getElementById('ad-refund-amount').textContent);
  check('the offer names the amount', label.includes(String(fine)), label);
  await page.screenshot({ path: SHOTS + '/ad-refund.png' });

  // While the ad plays the run is frozen in place, not paused.
  await page.evaluate(() => { game.ads.fake.seconds = 1.2; });
  const carBefore = await page.evaluate(
    () => [game.session.car.x, game.session.car.z]);
  await page.click('#btn-ad-refund');
  const during = await page.evaluate(() => ({
    state: game.state,
    paused: document.getElementById('screen-paused').classList.contains('is-visible'),
  }));
  await adDone(page);
  await page.evaluate(() => { game.ads.fake.seconds = 0.15; });
  const refund = await page.evaluate(() => ({
    coins: game.session.stats.coins, fines: game.session.stats.fines,
    state: game.state, car: [game.session.car.x, game.session.car.z],
  }));
  check('the run is frozen while the ad plays', during.state === 'watching'
        && !during.paused, JSON.stringify(during));
  check('and picks up where it stopped', refund.state === 'playing'
        && Math.hypot(refund.car[0] - carBefore[0], refund.car[1] - carBefore[1]) < 0.05,
        JSON.stringify({ before: carBefore, after: refund.car }));
  check('the fine comes back', refund.coins === 2000
        && refund.fines === bust.fines - fine, JSON.stringify(refund));
  check('the offer is gone once used', !await visible(page, '#btn-ad-refund'));
  const twice = await page.evaluate(() => game.session.refundFine());
  check('a fine is only refunded once', twice === 0);

  // An offer nobody takes runs out by itself.
  await page.evaluate(() => {
    const s = game.session;
    const real = s.police.update.bind(s.police);
    s.police.update = () => {
      s.police.update = real;
      return { busted: true };
    };
    game.update(1 / 60);
  });
  await page.waitForTimeout(150);
  const shown = await visible(page, '#btn-ad-refund');
  await page.waitForTimeout(9500);
  check('an untaken offer expires', shown && !await visible(page, '#btn-ad-refund'));

  await page.click('#btn-pause');
  await page.waitForTimeout(200);
  await page.click('#btn-quit');
  await page.waitForTimeout(300);
}

// --- highway: continue and double --------------------------------------------
{
  await page.click('#btn-play-highway');
  await page.waitForTimeout(400);

  // Drive a short way on an empty road, add some coins, then crash. The road
  // is cleared first so the crash is the one asked for and not an accident
  // on the way -- an accident would end the run before the coins went in.
  const crash = async (coins) => page.evaluate((add) => {
    const s = game.session;
    s.traffic.reset();
    for (let i = 0; i < 60 && !s.over; i++) {
      game.testInput = { steer: 0, throttle: 1, brake: false };
      game.update(1 / 60);
    }
    s.run.coins += add;
    s.player.crash();
    s.over = true;
    game.update(1 / 60);
    return { state: game.state, coins: s.run.coins, score: s.run.score };
  }, coins);

  const startCoins = await page.evaluate(() => game.save.get().coins);
  const startRuns = await page.evaluate(() => game.save.get().runs);
  const first = await crash(40);
  await page.waitForTimeout(200);
  check('a crash ends the run', first.state === 'over');
  check('the result screen offers to continue', await visible(page, '#btn-ad-continue'));
  check('and to double the coins', await visible(page, '#btn-ad-double'));
  const hint = await page.evaluate(
    () => document.getElementById('ad-double-hint').textContent);
  check('the double names what it adds', hint.includes(String(first.coins)), hint);
  await page.screenshot({ path: SHOTS + '/ad-over.png' });
  const banked = await page.evaluate(() => game.save.get().coins);
  check('the run is banked once at the crash', banked === startCoins + first.coins,
        `${startCoins} -> ${banked} for ${first.coins}`);

  await page.click('#btn-ad-double');
  await adDone(page);
  await page.waitForTimeout(150);
  const doubled = await page.evaluate(() => ({
    coins: game.save.get().coins,
    shown: document.getElementById('over-coins').textContent,
  }));
  check('doubling pays the run\'s coins again',
        doubled.coins === banked + first.coins, JSON.stringify(doubled));
  check('the result shows the doubled total',
        doubled.shown === String(first.coins * 2), doubled.shown);
  check('doubling is offered once', !await visible(page, '#btn-ad-double'));
  check('continuing is still offered', await visible(page, '#btn-ad-continue'));

  await page.click('#btn-ad-continue');
  await adDone(page);
  await page.waitForTimeout(150);
  const resumed = await page.evaluate(() => {
    const s = game.session;
    const near = s.traffic.active.filter(
      (car) => Math.abs(car.holder.position.z - s.player.z) < 30).length;
    return { state: game.state, over: s.over, crashed: s.player.crashed,
             score: s.run.score, speed: s.player.speed, near };
  });
  check('continuing puts the car back on the road',
        resumed.state === 'playing' && !resumed.over && !resumed.crashed
        && resumed.speed > 0, JSON.stringify(resumed));
  // At least the score it had: the frame loop is live again by the time this
  // is read, so a moment of driving may already have added to it.
  check('with the score it had', first.score > 0 && resumed.score >= first.score
        && resumed.score < first.score + 200,
        `${Math.round(first.score)} -> ${Math.round(resumed.score)}`);
  check('and no traffic on top of it', resumed.near === 0);

  const second = await crash(25);
  await page.waitForTimeout(200);
  const end = await page.evaluate(() => ({
    coins: game.save.get().coins, runs: game.save.get().runs,
    shown: document.getElementById('over-coins').textContent,
  }));
  check('a continued run banks only what it added',
        end.coins === doubled.coins + (second.coins - first.coins),
        `${doubled.coins} -> ${end.coins}`);
  check('and counts as one run', end.runs === startRuns + 1, `${startRuns} -> ${end.runs}`);
  check('the result shows the whole run', end.shown === String(second.coins + 40),
        end.shown);
  check('a run is continued at most once', !await visible(page, '#btn-ad-continue'));
  check('with both used, no ad row is left', !await visible(page, '#over-ads'));

  // A new run gets new offers.
  await page.click('#btn-retry');
  await page.waitForTimeout(300);
  await crash(10);
  await page.waitForTimeout(200);
  check('a new run is offered both again', await visible(page, '#btn-ad-continue')
        && await visible(page, '#btn-ad-double'));
}

// --- English -----------------------------------------------------------------
{
  const en = await browser.newPage({
    viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true, isMobile: true,
  });
  en.setDefaultTimeout(60000);
  en.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
  await en.goto(BASE + '?ads=fake', { waitUntil: 'load' });
  await waitForMenu(en);
  const text = await en.evaluate(() => ({
    aria: document.getElementById('btn-ad-coins').getAttribute('aria-label'),
    refund: document.querySelector('#btn-ad-refund [data-i18n="ads.refund"]').textContent,
    resume: document.querySelector('#btn-ad-continue [data-i18n="ads.continue"]').textContent,
  }));
  check('ad offers are translated', text.aria === 'Watch an ad for 150 coins'
        && text.refund === 'GET YOUR FINE BACK' && text.resume === '▶ CONTINUE',
        JSON.stringify(text));
  await en.close();
}

await browser.close();
if (problems.length) {
  failures += 1;
  console.log('JS PROBLEMS:\n' + problems.slice(0, 8).join('\n'));
} else {
  console.log('PASS  no console/page errors');
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
