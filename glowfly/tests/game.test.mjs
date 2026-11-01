/**
 * The game in a real browser, with the stand-in portal (`?portal=fake`):
 * menus, steering, level-ups, death, every rewarded ad, the shop, saving.
 *
 *     node tests/game.test.mjs
 *
 * Game time is stepped through `glowfly.step()` rather than waited on --
 * software rendering here manages a few frames a second.
 */

import { launch, open, check, visible, adDone, finish, SHOTS } from './harness.mjs';

const browser = await launch();

/**
 * Step until `test` holds or the run ends. Level-ups take the first card,
 * unless `stopAtLevel` -- then a level-up is where it stops.
 */
const stepUntil = (page, test, max = 60 * 120, stopAtLevel = false) => page.evaluate(([source, limit, stop]) => {
  const until = new Function('g', `return (${source})(g)`);
  const g = window.glowfly.game;
  for (let i = 0; i < limit; i += 1) {
    if (until(g)) return true;
    while (g.state === 'level' && !stop) g.choose(0);
    if (g.state !== 'playing') return until(g);
    window.glowfly.step(1, { x: Math.cos(i / 90), y: Math.sin(i / 70) });
  }
  return until(g);
}, [test.toString(), max, stopAtLevel]);

const kill = (page) => page.evaluate(() => {
  const g = window.glowfly.game;
  const run = g.run;
  run.player.inv = 0;
  run.hurtPlayer(run.player.hp + 1);
  window.glowfly.step(1);
  return g.state;
});

// --- a plain page: no portal, no ads ------------------------------------------
{
  const page = await open(browser, '?seed=3');
  check('a plain page has no portal', await page.evaluate(() => window.glowfly.portal.name()) === 'none');
  check('and offers no ads', !await visible(page, '#btn-free-gold'));
  await page.click('#btn-play');
  await stepUntil(page, (g) => g.state === 'over' || g.run.time > 20);
  check('but plays all the same', await page.evaluate(() => window.glowfly.game.run.time > 19));
  await kill(page);
  check('and its result screen offers no ads', !await visible(page, '#btn-revive')
        && !await visible(page, '#btn-double'));
  await page.close();
}

const page = await open(browser);
const log = () => page.evaluate(() => window.glowfly.portal.fake.log.slice());

// --- title -----------------------------------------------------------------------
{
  await page.screenshot({ path: SHOTS + '/title.png' });
  check('the title offers free gold', await visible(page, '#btn-free-gold'));
  const label = await page.textContent('#free-gold-label');
  check('and says how much', label.includes('60'), label);
  const calls = await log();
  check('loading is reported to the portal', calls.includes('loadingStart')
        && calls.indexOf('loadingStop') > calls.indexOf('loadingStart'), calls.join(','));

  await page.evaluate(() => { window.glowfly.portal.fake.rewardedPays = false; });
  await page.click('#btn-free-gold');
  await adDone(page);
  check('an ad closed early pays nothing', await page.evaluate(() => window.glowfly.save.get().gold) === 0);
  check('and says so', (await page.textContent('#toast')).includes('no reward'));

  await page.evaluate(() => {
    window.glowfly.portal.fake.rewardedPays = true;
    window.glowfly.portal.fake.rewardedAvailable = false;
  });
  await page.click('#btn-free-gold');
  await adDone(page);
  check('no ad to show pays nothing either', await page.evaluate(() => window.glowfly.save.get().gold) === 0);
  check('and says to try later', (await page.textContent('#toast')).includes('No ad available'));

  await page.evaluate(() => { window.glowfly.portal.fake.rewardedAvailable = true; });
  await page.evaluate(() => { window.glowfly.portal.fake.seconds = 0.8; });
  await page.click('#btn-free-gold');
  const during = await page.evaluate(() => ({
    curtain: document.getElementById('curtain').classList.contains('is-visible'),
  }));
  await adDone(page);
  await page.evaluate(() => { window.glowfly.portal.fake.seconds = 0.1; });
  check('the game is covered while an ad plays', during.curtain);
  check('a watched ad pays the gold', await page.evaluate(() => window.glowfly.save.get().gold) === 60);
  check('and the offer rests for its cooldown', !await visible(page, '#btn-free-gold'));
  check('the title shows the new balance', (await page.textContent('#title-gold')) === '60');
}

// --- a run ----------------------------------------------------------------------------
{
  await page.click('#btn-play');
  await page.waitForFunction(() => window.glowfly.game.state === 'playing');
  let calls = await log();
  check('the first run starts without an ad', !calls.includes('midgame'));
  check('and tells the portal gameplay started', calls[calls.length - 1] === 'gameplayStart');

  // Keyboard steering, and the keys must not scroll the portal's page.
  const moved = await page.evaluate(() => {
    const run = window.glowfly.game.run;
    const x = run.player.x;
    const down = new KeyboardEvent('keydown', { code: 'ArrowRight', cancelable: true });
    window.dispatchEvent(down);
    window.glowfly.game.testMove = null;
    for (let i = 0; i < 30; i += 1) window.glowfly.game.tick();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    return { dx: run.player.x - x, prevented: down.defaultPrevented };
  });
  check('arrow keys steer', moved.dx > 50, moved.dx.toFixed(1));
  check('and do not scroll the page', moved.prevented);

  // Touch: a drag anywhere is a stick.
  const before = await page.evaluate(() => window.glowfly.game.run.player.y);
  await page.evaluate(() => {
    const surface = document.getElementById('surface');
    const fire = (type, x, y) => surface.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
    fire('pointerdown', 200, 400);
    fire('pointermove', 200, 480);
    for (let i = 0; i < 30; i += 1) window.glowfly.game.tick();
    window.__stickShown = document.getElementById('stick').classList.contains('is-visible');
    fire('pointerup', 200, 480);
  });
  const after = await page.evaluate(() => window.glowfly.game.run.player.y);
  check('dragging down flies down', after - before > 50, (after - before).toFixed(1));
  check('and shows the stick under the finger', await page.evaluate(() => window.__stickShown));

  // Level up.
  await stepUntil(page, (g) => g.state === 'level', 60 * 120, true);
  check('dew turns into a level-up', await page.evaluate(() => window.glowfly.game.state) === 'level');
  const cards = await page.$$eval('.card', (nodes) => nodes.map((n) => n.dataset.choice));
  check('with three cards', cards.length === 3, cards.join(','));
  check('and a reroll offer', await visible(page, '#btn-reroll'));
  await page.screenshot({ path: SHOTS + '/level.png' });
  await page.click('#btn-reroll');
  await adDone(page);
  const rerolled = await page.$$eval('.card', (nodes) => nodes.map((n) => n.dataset.choice));
  check('a reroll ad deals new cards', rerolled.join() !== cards.join(), rerolled.join(','));
  check('once per level-up', !await visible(page, '#btn-reroll'));
  const picked = rerolled[1];
  await page.keyboard.press('Digit2');
  const taken = await page.evaluate((id) => {
    const run = window.glowfly.game.run;
    return { state: window.glowfly.game.state, weapon: run.weapons.has(id), passive: run.passives.has(id) };
  }, picked);
  check('the 2 key takes the second card and applies it', taken.weapon || taken.passive || picked === 'honey', picked);
  await page.evaluate(() => { while (window.glowfly.game.state === 'level') window.glowfly.game.choose(0); });

  // Pause.
  await page.keyboard.press('Escape');
  check('Escape pauses', await page.evaluate(() => window.glowfly.game.state) === 'paused'
        && await visible(page, '#screen-pause'));
  calls = await log();
  check('and the portal is told gameplay stopped', calls[calls.length - 1] === 'gameplayStop');
  await page.click('#btn-resume');
  check('resume carries on', await page.evaluate(() => window.glowfly.game.state) === 'playing');

  // A hidden tab pauses.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check('a hidden tab pauses the night', await page.evaluate(() => window.glowfly.game.state) === 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    window.glowfly.game.resume();
  });
}

// --- death, revive and double ------------------------------------------------------------
{
  const gold0 = await page.evaluate(() => window.glowfly.save.get().gold);
  const runs0 = await page.evaluate(() => window.glowfly.save.get().runs);
  // Tough enough that the only death here is the one the test deals.
  // (Invulnerability rather than health: a level-up recomputes max health.)
  const tough = () => page.evaluate(() => {
    window.glowfly.game.run.player.inv = 1e9;
  });
  await tough();
  await stepUntil(page, (g) => g.run.time > 130, 60 * 140);
  await page.evaluate(() => { while (window.glowfly.game.state === 'level') window.glowfly.game.choose(0); });
  await kill(page);
  await page.waitForTimeout(100);
  const first = await page.evaluate(() => ({
    state: window.glowfly.game.state, gold: window.glowfly.save.get().gold,
    banked: window.glowfly.game.banked, shown: document.getElementById('over-gold').textContent,
    double: document.getElementById('double-label').textContent,
  }));
  check('death ends the run on the result screen', first.state === 'over' && await visible(page, '#screen-over'));
  check('the run is paid at once', first.gold === gold0 + first.banked && first.banked >= 5,
        `${gold0} -> ${first.gold}`);
  check('the result names the gold', first.shown === String(first.banked), first.shown);
  check('revive and double are offered', await visible(page, '#btn-revive') && await visible(page, '#btn-double'));
  check('the double names its amount', first.double.includes(String(first.banked)), first.double);
  await page.screenshot({ path: SHOTS + '/over.png' });

  await page.click('#btn-double');
  await adDone(page);
  const doubled = await page.evaluate(() => ({
    gold: window.glowfly.save.get().gold, shown: document.getElementById('over-gold').textContent,
  }));
  check('doubling pays the run again', doubled.gold === first.gold + first.banked);
  check('and shows the doubled total', doubled.shown === String(first.banked * 2), doubled.shown);
  check('doubling is offered once', !await visible(page, '#btn-double'));

  const audioDuring = await page.evaluate(async () => {
    window.glowfly.portal.fake.seconds = 0.5;
    const ad = window.glowfly.game.adRevive();
    await new Promise((r) => setTimeout(r, 200));
    const { isSilent } = await import('./js/audio.js');
    const silent = isSilent();
    await ad;
    window.glowfly.portal.fake.seconds = 0.1;
    return silent;
  });
  check('the game is silent while an ad plays', audioDuring);
  const revived = await page.evaluate(() => ({
    state: window.glowfly.game.state, hp: window.glowfly.game.run.player.hp,
    revived: window.glowfly.game.run.revived,
  }));
  check('a revive puts the firefly back in the night', revived.state === 'playing' && revived.hp > 0
        && revived.revived);
  const calls = await log();
  check('and gameplay is reported started again', calls[calls.length - 1] === 'gameplayStart');

  await tough();
  await stepUntil(page, () => false, 60 * 5);       // five more seconds of night
  await page.evaluate(() => { while (window.glowfly.game.state === 'level') window.glowfly.game.choose(0); });
  await kill(page);
  const second = await page.evaluate(() => ({
    gold: window.glowfly.save.get().gold, banked: window.glowfly.game.banked,
    runs: window.glowfly.save.get().runs,
  }));
  check('a revived run banks only what it added', second.gold === doubled.gold + (second.banked - first.banked),
        `${doubled.gold} -> ${second.gold}`);
  check('and counts as one run', second.runs === runs0 + 1, `${runs0} -> ${second.runs}`);
  check('no second revive', !await visible(page, '#btn-revive'));
}

// --- the next run, the shop, saving ---------------------------------------------------------
{
  await page.click('#btn-again');
  await page.waitForFunction(() => window.glowfly.game.state === 'playing');
  const calls = await log();
  const tail = calls.slice(calls.lastIndexOf('gameplayStop'));
  check('a break between runs offers the portal a midgame ad', tail.includes('midgame')
        && tail.indexOf('midgame') < tail.indexOf('gameplayStart'), tail.join(','));
  await page.keyboard.press('Escape');
  await page.click('#btn-quit');
  check('ending a run early still shows a result', await page.evaluate(() => window.glowfly.game.state) === 'over');
  await page.click('#btn-menu');

  await page.evaluate(() => { window.glowfly.save.get().gold = 1000; window.glowfly.save.save(); });
  await page.click('#btn-shop');
  await page.screenshot({ path: SHOTS + '/shop.png' });
  await page.click('.item[data-meta="vitality"] .btn');
  const bought = await page.evaluate(() => ({
    level: window.glowfly.save.metaLevel('vitality'), gold: window.glowfly.save.get().gold,
    price: window.glowfly.META.vitality.cost[0],
  }));
  check('the shop sells an upgrade', bought.level === 1 && bought.gold === 1000 - bought.price,
        JSON.stringify(bought));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.glowfly && window.glowfly.game.state === 'title');
  const kept = await page.evaluate(() => ({
    level: window.glowfly.save.metaLevel('vitality'), gold: window.glowfly.save.get().gold,
    best: window.glowfly.save.get().best, free: !document.getElementById('btn-free-gold').classList.contains('is-hidden'),
  }));
  check('upgrades and gold survive a reload', kept.level === 1 && kept.gold === bought.gold);
  check('so does the best time', kept.best > 100, String(kept.best));
  check('and the free-gold cooldown', !kept.free);
  await page.evaluate(() => { window.glowfly.portal.fake.seconds = 0.1; });
  await page.click('#btn-play');
  check('a bought upgrade reaches the next run',
        await page.evaluate(() => window.glowfly.game.run.player.maxHp) === 115);
  check('the title is not shown during a run', !await visible(page, '#screen-title'));
}

// --- dawn ----------------------------------------------------------------------------------
{
  const dawn = await page.evaluate(() => {
    const g = window.glowfly.game;
    g.run.player.hp = g.run.player.maxHp = 1e6;
    g.run.time = window.glowfly.DAWN - 0.1;
    window.glowfly.step(20);
    return { state: g.state, won: g.run.won, dawns: window.glowfly.save.get().dawns,
             title: document.getElementById('over-title').textContent,
             happy: window.glowfly.portal.fake.log.includes('happytime') };
  });
  check('surviving to dawn wins', dawn.state === 'over' && dawn.won && dawn.title === 'DAWN!', dawn.title);
  check('and is counted', dawn.dawns === 1);
  check('and celebrated with the portal', dawn.happy);
  check('a won night offers no revive', !await visible(page, '#btn-revive'));
}

// --- Turkish ----------------------------------------------------------------------------------
{
  const tr = await open(browser, '?portal=fake', { locale: 'tr-TR' });
  const text = await tr.evaluate(() => ({
    play: document.getElementById('btn-play').textContent,
    tag: document.querySelector('.tagline').textContent,
  }));
  check('a Turkish browser gets Turkish', text.play === 'OYNA' && text.tag.startsWith('Geceyi'), JSON.stringify(text));
  const missing = await tr.evaluate(async () => {
    const { STRINGS_FOR_TESTS: s } = await import('./js/i18n.js');
    return Object.keys(s.en).filter((k) => !(k in s.tr));
  });
  check('every English string has a Turkish one', missing.length === 0, missing.join(','));
  await tr.close();
}

await browser.close();
finish();
