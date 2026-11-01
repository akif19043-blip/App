/**
 * The real portal back ends, against stand-ins for their SDKs.
 *
 *     node tests/portals.test.mjs
 *
 * The SDK scripts only load on the portals' own pages, so each one is
 * replaced by an object with the same shape that records what it was asked
 * to do (the shapes are CrazyGames SDK v3 and Poki SDK v2). What is checked
 * is the game's side: the right calls, in the right order, with sound off
 * during ads and rewards paid only when the SDK says so.
 */

import { launch, open, check, visible, adDone, finish } from './harness.mjs';

const browser = await launch();

const crazyGames = (mode) => {
  window.__calls = [];
  const log = (call) => window.__calls.push(call);
  const store = {};
  window.CrazyGames = {
    SDK: {
      init: async () => log('init'),
      game: {
        loadingStart: async () => log('loadingStart'),
        loadingStop: async () => log('loadingStop'),
        gameplayStart: async () => log('gameplayStart'),
        gameplayStop: async () => log('gameplayStop'),
        happytime: async () => log('happytime'),
        settings: { muteAudio: false, disableChat: false },
        addSettingsChangeListener: (fn) => { window.__settingsChanged = fn; },
      },
      ad: {
        requestAd(type, callbacks) {
          log('requestAd:' + type);
          if (window.__adMode === 'error') {
            setTimeout(() => callbacks.adError('No ad available'), 20);
            return;
          }
          setTimeout(() => {
            callbacks.adStarted();
            window.__silentDuringAd = window.__isSilent && window.__isSilent();
          }, 20);
          setTimeout(() => callbacks.adFinished(), 120);
        },
      },
      data: {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { log('data.setItem'); store[key] = value; },
        removeItem: (key) => { delete store[key]; },
        clear: () => {},
      },
    },
  };
  window.__adMode = mode;
};

const poki = () => {
  window.__calls = [];
  const log = (call) => window.__calls.push(call);
  window.PokiSDK = {
    init: () => { log('init'); return Promise.resolve(); },
    gameLoadingFinished: () => log('gameLoadingFinished'),
    gameplayStart: () => log('gameplayStart'),
    gameplayStop: () => log('gameplayStop'),
    commercialBreak: (onStart) => {
      log('commercialBreak');
      if (onStart) onStart();
      return new Promise((resolve) => setTimeout(resolve, 60));
    },
    rewardedBreak: (onStart) => {
      log('rewardedBreak');
      if (onStart) onStart();
      return new Promise((resolve) => setTimeout(() => resolve(true), 60));
    },
  };
};

const calls = (page) => page.evaluate(() => window.__calls.slice());
const exposeSilence = (page) => page.evaluate(async () => {
  const audio = await import('./js/audio.js');
  window.__isSilent = audio.isSilent;
  audio.unlock();
});

/** Play a run to its end: step a little, then a fatal hit. */
const playAndDie = (page) => page.evaluate(() => {
  const g = window.glowfly.game;
  for (let i = 0; i < 600 && g.state === 'playing'; i += 1) {
    window.glowfly.step(1, { x: 1, y: 0 });
    while (g.state === 'level') g.choose(0);
  }
  if (g.state === 'playing') {
    g.run.player.inv = 0;
    g.run.hurtPlayer(g.run.player.hp + 1);
    window.glowfly.step(1);
  }
  return g.state;
});

// --- CrazyGames ----------------------------------------------------------------
{
  const page = await open(browser, '?seed=4', { init: crazyGames });
  await page.evaluate(() => { window.__adMode = 'ok'; });
  await exposeSilence(page);
  check('CrazyGames is detected', await page.evaluate(() => window.glowfly.portal.name()) === 'crazygames');
  let log = await calls(page);
  check('the SDK is initialised, then loading reported',
        log[0] === 'init' && log.indexOf('loadingStart') < log.indexOf('loadingStop'), log.join(','));

  check('rewarded offers are shown', await visible(page, '#btn-free-gold'));
  await page.click('#btn-free-gold');
  await adDone(page);
  log = await calls(page);
  check('free gold asks for a rewarded ad', log.includes('requestAd:rewarded'));
  check('and pays once it finishes', await page.evaluate(() => window.glowfly.save.get().gold) === 60);
  check('the game is silent while the ad plays', await page.evaluate(() => window.__silentDuringAd) === true);
  check('and not after', await page.evaluate(() => window.__isSilent()) === false);
  check('progress is saved through the SDK, not localStorage',
        log.includes('data.setItem') && await page.evaluate(() => localStorage.getItem('glowfly.v1')) === null);

  await page.click('#btn-play');
  log = await calls(page);
  check('the first run starts with no midgame ad', !log.includes('requestAd:midgame'));
  check('gameplay start is reported', log[log.length - 1] === 'gameplayStart');
  await page.keyboard.press('Escape');
  log = await calls(page);
  check('a pause reports gameplay stopped', log[log.length - 1] === 'gameplayStop');
  await page.keyboard.press('Escape');

  check('the run ends', await playAndDie(page) === 'over');
  await page.evaluate(() => { window.__adMode = 'error'; });
  await page.click('#btn-revive');
  await adDone(page);
  check('an ad error pays nothing', await page.evaluate(() => window.glowfly.game.state) === 'over');
  check('and the player is told', (await page.textContent('#toast')).includes('No ad available'));
  await page.evaluate(() => { window.__adMode = 'ok'; });
  await page.click('#btn-revive');
  await adDone(page);
  check('a finished rewarded ad revives', await page.evaluate(() => window.glowfly.game.state) === 'playing');

  check('the run ends again', await playAndDie(page) === 'over');
  await page.click('#btn-again');
  await page.waitForFunction(() => window.glowfly.game.state === 'playing');
  log = await calls(page);
  const tail = log.slice(log.lastIndexOf('gameplayStop'));
  check('the next run is preceded by a midgame ad', tail.indexOf('requestAd:midgame') >= 0
        && tail.indexOf('requestAd:midgame') < tail.indexOf('gameplayStart'), tail.join(','));

  // The portal's own mute setting silences the game, and lifting it restores sound.
  await page.evaluate(() => {
    window.CrazyGames.SDK.game.settings.muteAudio = true;
    window.__settingsChanged();
  });
  check('the portal mute setting silences the game', await page.evaluate(() => window.__isSilent()));
  await page.evaluate(() => {
    window.CrazyGames.SDK.game.settings.muteAudio = false;
    window.__settingsChanged();
  });
  check('and lifting it brings the sound back', await page.evaluate(() => !window.__isSilent()));
  await page.close();
}

// --- Poki ---------------------------------------------------------------------------
{
  const page = await open(browser, '?seed=4', { init: poki });
  check('Poki is detected', await page.evaluate(() => window.glowfly.portal.name()) === 'poki');
  let log = await calls(page);
  check('loading finished is reported', log.includes('gameLoadingFinished'), log.join(','));
  await page.click('#btn-free-gold');
  await adDone(page);
  log = await calls(page);
  check('free gold is a rewarded break', log.includes('rewardedBreak'));
  check('and pays when the break resolves true', await page.evaluate(() => window.glowfly.save.get().gold) === 60);
  check('progress is kept in localStorage', await page.evaluate(() => !!localStorage.getItem('glowfly.v1')));
  await page.click('#btn-play');
  check('the run ends', await playAndDie(page) === 'over');
  await page.click('#btn-again');
  await page.waitForFunction(() => window.glowfly.game.state === 'playing');
  log = await calls(page);
  const tail = log.slice(log.lastIndexOf('gameplayStop'));
  check('a commercial break comes between runs', tail.indexOf('commercialBreak') >= 0
        && tail.indexOf('commercialBreak') < tail.indexOf('gameplayStart'), tail.join(','));
  await page.close();
}

// --- an ad blocker ate the SDK ---------------------------------------------------------
{
  // The page as tools/build.py ships it for CrazyGames, with the SDK request
  // refused the way an ad blocker refuses it.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await page.route('**/index.html*', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<!-- PORTAL_SDK -->',
      '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>');
    await route.fulfill({ response, body: html });
  });
  await page.route('https://sdk.crazygames.com/**', (route) => route.abort());
  await page.goto(process.env.GAME_URL + '/index.html', { waitUntil: 'load' });
  const booted = await page.waitForFunction(
    () => window.glowfly && window.glowfly.game.state === 'title', { timeout: 30000 })
    .then(() => true, () => false);
  check('a blocked SDK still lets the game start', booted);
  check('and simply offers no ads', !await visible(page, '#btn-free-gold'));
  await page.click('#btn-play');
  check('and plays', await page.evaluate(() => window.glowfly.game.state) === 'playing');
  await page.close();
}

await browser.close();
finish();
