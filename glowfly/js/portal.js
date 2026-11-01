/**
 * The game's one door to whichever site is hosting it.
 *
 * Game portals pay for web games by showing ads in them, through their own
 * SDK: they need to know when a run is being played (no ad then), when there
 * is a natural break (an ad may go there), and they run the rewarded ads a
 * player asks for. Each portal names these differently; the rest of the game
 * only ever calls this module.
 *
 *   crazygames  window.CrazyGames.SDK (v3), injected by tools/build.py
 *   poki        window.PokiSDK (v2), injected by tools/build.py
 *   fake        `?portal=fake`: ads that "play" for a moment, for the tests
 *               and for trying the flow on a computer
 *   none        anywhere else. No ads at all; rewarded buttons stay hidden.
 */

let kind = 'none';
let sdk = null;
let playing = false;
let adActive = false;
const muteWatchers = new Set();

/** Knobs the browser suites turn. Only the fake back end reads them. */
export const fake = {
  seconds: 0.6,
  rewardedPays: true,
  rewardedAvailable: true,
  log: [],            // every call the game made, in order
};

function note(call) {
  if (kind === 'fake') fake.log.push(call);
}

export function name() {
  return kind;
}

/** True where rewarded ads exist at all, so the buttons are worth showing. */
export function hasRewarded() {
  return kind !== 'none';
}

export function isAdActive() {
  return adActive;
}

/**
 * Find and start the SDK. Never throws: an ad blocker or a dead network must
 * cost the portal its ads, not the player their game.
 */
export async function init() {
  const params = new URLSearchParams(location.search);
  try {
    if (window.CrazyGames && window.CrazyGames.SDK) {
      sdk = window.CrazyGames.SDK;
      await sdk.init();
      kind = 'crazygames';
      sdk.game.addSettingsChangeListener(() => notifyMute());
    } else if (window.PokiSDK) {
      sdk = window.PokiSDK;
      kind = 'poki';
      await sdk.init();
    } else if (params.get('portal') === 'fake') {
      kind = 'fake';
    }
  } catch (err) {
    // Poki rejects init() under an ad blocker but the SDK still works for
    // everything except ads; CrazyGames likewise. Keep the kind, carry on.
    console.warn('portal init:', err);
  }
  note('init');
  return kind;
}

export function loadingStart() {
  note('loadingStart');
  try {
    if (kind === 'crazygames') sdk.game.loadingStart();
  } catch (err) { /* reporting only */ }
}

export function loadingStop() {
  note('loadingStop');
  try {
    if (kind === 'crazygames') sdk.game.loadingStop();
    else if (kind === 'poki') sdk.gameLoadingFinished();
  } catch (err) { /* reporting only */ }
}

/** The player is in a run, actively playing. Idempotent. */
export function gameplayStart() {
  if (playing) return;
  playing = true;
  note('gameplayStart');
  try {
    if (kind === 'crazygames') sdk.game.gameplayStart();
    else if (kind === 'poki') sdk.gameplayStart();
  } catch (err) { /* reporting only */ }
}

/** Menus, pauses, the result screen. Idempotent. */
export function gameplayStop() {
  if (!playing) return;
  playing = false;
  note('gameplayStop');
  try {
    if (kind === 'crazygames') sdk.game.gameplayStop();
    else if (kind === 'poki') sdk.gameplayStop();
  } catch (err) { /* reporting only */ }
}

/** A moment worth celebrating (the portal may show confetti). */
export function happytime() {
  note('happytime');
  try {
    if (kind === 'crazygames') sdk.game.happytime();
  } catch (err) { /* cosmetic */ }
}

/**
 * Run an ad, with the game muted and paused around it. `hooks.start` and
 * `hooks.end` are where the caller does that.
 */
async function runAd(type, hooks) {
  if (adActive) return { shown: false, paid: false };
  adActive = true;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    if (hooks && hooks.start) hooks.start();
  };
  try {
    if (kind === 'crazygames') {
      return await new Promise((resolve) => {
        sdk.ad.requestAd(type, {
          adStarted: start,
          adFinished: () => resolve({ shown: true, paid: true }),
          adError: (error) => resolve({ shown: false, paid: false, error: String(error) }),
        });
      });
    }
    if (kind === 'poki') {
      if (type === 'rewarded') {
        const paid = await sdk.rewardedBreak(start);
        return { shown: started, paid: !!paid };
      }
      await sdk.commercialBreak(start);
      return { shown: started, paid: false };
    }
    if (kind === 'fake') {
      if (type === 'rewarded' && !fake.rewardedAvailable) {
        return { shown: false, paid: false, error: 'No ad available' };
      }
      start();
      await new Promise((resolve) => setTimeout(resolve, fake.seconds * 1000));
      return { shown: true, paid: type === 'rewarded' && fake.rewardedPays };
    }
    return { shown: false, paid: false };
  } catch (err) {
    console.warn('ad failed:', err);
    return { shown: false, paid: false, error: String(err) };
  } finally {
    adActive = false;
    if (started && hooks && hooks.end) hooks.end();
  }
}

/**
 * An ad at a natural break -- between runs. The portal decides whether one
 * actually plays (both rate-limit them); this resolves when the game may go on.
 */
export async function midgame(hooks) {
  note('midgame');
  if (kind === 'none') return { shown: false };
  return runAd('midgame', hooks);
}

/**
 * An ad the player asked for. Resolves with `paid` true only if it was
 * watched to the end: the caller pays the reward then and never otherwise.
 */
export async function rewarded(hooks) {
  note('rewarded');
  if (kind === 'none') return { shown: false, paid: false };
  return runAd('rewarded', hooks);
}

/** Whether the portal asks for the game to be silent (CrazyGames setting). */
export function portalMuted() {
  try {
    return kind === 'crazygames' && !!sdk.game.settings.muteAudio;
  } catch (err) {
    return false;
  }
}

export function onMuteChange(fn) {
  muteWatchers.add(fn);
}

function notifyMute() {
  for (const fn of muteWatchers) fn(portalMuted());
}

// --------------------------------------------------------------- storage --
// CrazyGames keeps SDK data with the player's account; elsewhere it is
// localStorage. Both are wrapped: some browsers throw on storage in iframes.

export function getItem(key) {
  try {
    if (kind === 'crazygames') return sdk.data.getItem(key);
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

export function setItem(key, value) {
  try {
    if (kind === 'crazygames') sdk.data.setItem(key, value);
    else localStorage.setItem(key, value);
  } catch (err) {
    /* nowhere to keep it */
  }
}
