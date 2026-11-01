/**
 * Rewarded video ads.
 *
 * Nothing in the game interrupts play with an ad. Every one is asked for, on a
 * button that names the reward, and the reward is only paid when the ad SDK
 * says the video was watched. Anyone who never taps one plays the same game
 * as before -- and that is also what keeps it inside AdMob's rewarded-ad
 * policy, which forbids ads nobody opted into.
 *
 * Three back ends, picked once at start-up:
 *
 *  - admob  inside the Android app, through @capacitor-community/admob.
 *  - fake   `?ads=fake` in the URL: a pretend ad that pays after a moment,
 *           for the browser test suites and for trying the buttons on a PC.
 *  - none   a plain browser. `ready()` never turns true, so no offer appears.
 *
 * This module knows one thing: whether an ad is loaded and can be shown.
 * What a reward is worth and where it is offered is for rewards.js and
 * main.js to decide.
 */

import { ADS } from './config.js';

/** Google's sample publisher. Its ads look real and pay nothing. */
const TEST_PUBLISHER = '3940256099942544';
const EXPIRY = 50 * 60 * 1000;   // a loaded rewarded ad is only good for an hour

let backend = 'none';
let plugin = null;
let unitId = '';
let state = 'off';               // off | loading | ready | showing
let failures = 0;
let retryHandle = 0;
let expiryHandle = 0;
let privacyChoices = false;
let pending = null;              // the show() in flight
const watchers = new Set();

/** Knobs the browser suites turn. Only the fake back end reads them. */
export const fake = { pays: true, seconds: 0.8 };

function setState(next) {
  if (state === next) return;
  state = next;
  for (const watcher of watchers) {
    try {
      watcher(state === 'ready');
    } catch (err) {
      console.error(err);
    }
  }
}

/** Call `fn(ready)` whenever an ad becomes, or stops being, available. */
export function onChange(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

export function ready() {
  return state === 'ready';
}

export function kind() {
  return backend;
}

/** True when the UMP SDK has a consent form the player can reopen. */
export function hasPrivacyChoices() {
  return privacyChoices;
}

/**
 * Pick a back end and get the first ad loading. Never throws: a game that
 * fails to start because an ad network was unreachable has its priorities
 * backwards.
 */
export async function init() {
  try {
    if (new URLSearchParams(location.search).get('ads') === 'fake') {
      backend = 'fake';
      setState('ready');
      return backend;
    }
    // The Android shell injects window.Capacitor before any page script runs;
    // a browser has none, and then there is nothing to load.
    const shell = window.Capacitor;
    if (!shell || typeof shell.isNativePlatform !== 'function'
        || !shell.isNativePlatform()) {
      return backend;
    }
    const core = await import('@capacitor/core');
    if (!core.Capacitor.isPluginAvailable('AdMob')) return backend;
    plugin = core.registerPlugin('AdMob');

    const ids = await fetch('ads.json').then((response) => response.json());
    unitId = ids.rewardedUnitId;
    if (!unitId) return backend;
    if (unitId.includes(TEST_PUBLISHER)) {
      console.warn('ads: Google test ids in use -- these ads pay nothing');
    }

    await gatherConsent();
    await plugin.initialize({ maxAdContentRating: ADS.maxContentRating });
    await listen();
    backend = 'admob';
    load();
  } catch (err) {
    console.warn('ads unavailable', err);
  }
  return backend;
}

/**
 * Ask for consent where the law requires it (the EEA, the UK, Switzerland).
 * Google's UMP SDK decides whether to ask; elsewhere this is a no-op. It has
 * to run on every launch, and before any ad is requested.
 */
async function gatherConsent() {
  try {
    const info = await plugin.requestConsentInfo();
    privacyChoices = !!info.isConsentFormAvailable;
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') {
      await plugin.showConsentForm();
    }
  } catch (err) {
    // No answer from the consent service: ads still load, non-personalised
    // where the region demands it, which is the SDK's own fallback.
    console.warn('ads: consent check failed', err);
  }
}

/** Reopen the consent form, so a choice made once can be changed. */
export async function showPrivacyChoices() {
  if (backend !== 'admob' || !privacyChoices) return false;
  try {
    await plugin.showConsentForm();
    return true;
  } catch (err) {
    console.warn('ads: privacy form failed', err);
    return false;
  }
}

async function listen() {
  // The plugin resolves showRewardVideoAd() only when a reward is earned --
  // close the ad early and the promise never settles. So the outcome is
  // decided on the dismiss event instead, with the reward recorded on the way.
  await plugin.addListener('onRewardedVideoAdReward', () => {
    if (pending) pending.rewarded = true;
  });
  await plugin.addListener('onRewardedVideoAdDismissed', () => {
    // Android sends the reward first, but nothing promises that order.
    setTimeout(() => settle(), ADS.rewardGrace * 1000);
  });
  await plugin.addListener('onRewardedVideoAdFailedToShow', () => settle(false));
}

function load() {
  if (backend !== 'admob' || state === 'loading' || state === 'ready') return;
  clearTimeout(retryHandle);
  setState('loading');
  plugin.prepareRewardVideoAd({ adId: unitId })
    .then(() => {
      failures = 0;
      setState('ready');
      clearTimeout(expiryHandle);
      expiryHandle = setTimeout(() => {
        if (state !== 'ready') return;
        setState('off');
        load();
      }, EXPIRY);
    })
    .catch(() => {
      // No fill, or no network. Back off: asking again every second does not
      // make an ad appear, and AdMob notices apps that hammer it.
      setState('off');
      const delays = ADS.retryDelays;
      const wait = delays[Math.min(failures, delays.length - 1)];
      failures += 1;
      retryHandle = setTimeout(load, wait * 1000);
    });
}

function settle(outcome) {
  if (!pending) return;
  const { resolve, rewarded } = pending;
  pending = null;
  setState('off');
  load();
  resolve(outcome === undefined ? rewarded : outcome);
}

/**
 * Show the loaded ad. Resolves true only if the player watched it through --
 * the caller pays the reward then, and never otherwise.
 *
 * @returns {Promise<boolean>}
 */
export function show() {
  if (state !== 'ready') return Promise.resolve(false);
  clearTimeout(expiryHandle);
  setState('showing');

  if (backend === 'fake') {
    return new Promise((resolve) => {
      setTimeout(() => {
        setState('ready');
        resolve(!!fake.pays);
      }, fake.seconds * 1000);
    });
  }

  return new Promise((resolve) => {
    pending = { resolve, rewarded: false };
    plugin.showRewardVideoAd()
      .then(() => {
        if (pending) pending.rewarded = true;
      })
      .catch(() => settle(false));
  });
}

/** Fake back end only: pretend the network has, or has no, ad to give. */
export function setFakeReady(value) {
  if (backend !== 'fake' || state === 'showing') return;
  setState(value ? 'ready' : 'off');
}
