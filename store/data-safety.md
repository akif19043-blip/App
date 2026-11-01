# Play Console — Data Safety answers

Fill the Data Safety form with these. The game itself collects nothing: every
answer below comes from the **Google Mobile Ads SDK** (AdMob), which the
rewarded ads use. Google publishes the current list for the SDK at
<https://developers.google.com/admob/android/privacy/play-data-disclosure> —
check it against this page before submitting, since Google updates it as the
SDK changes.

## Overview

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — the SDK only talks to Google over HTTPS |
| Do you provide a way for users to request that their data is deleted? | **No** — we hold no user data; Google's data is tied to the advertising ID, which users can reset or delete in Android settings |

## Data types

Mark each as **collected** and **shared**, processed **ephemerally: no**,
collection **required** (the SDK collects it to load an ad, before anyone
taps anything).

| Category → type | Purposes |
|---|---|
| Location → **Approximate location** (from the IP address) | Advertising or marketing · Analytics · Fraud prevention, security, and compliance |
| App activity → **App interactions** (ad views and taps) | Advertising or marketing · Analytics · Fraud prevention, security, and compliance |
| App info and performance → **Crash logs** | Analytics · Fraud prevention, security, and compliance |
| App info and performance → **Diagnostics** | Analytics · Fraud prevention, security, and compliance |
| Device or other IDs → **Device or other IDs** (advertising ID, app set ID) | Advertising or marketing · Analytics · Fraud prevention, security, and compliance |

Nothing else: no name, email, contacts, photos, precise location, messages,
health, financial information or files.

Supporting notes, if the review asks:

- Progress is stored in the WebView's local storage, on the device only.
  There is no backend and no account system of ours.
- The only network traffic is the ads SDK's. The game plays offline; the ad
  buttons only appear once an ad has actually loaded.
- Ads are rewarded and opt-in only. There are no interstitials and no
  banners: nothing plays that the player did not ask for.
- `VIBRATE` drives optional haptic feedback and can be turned off in Settings.

## Ads declaration

**Yes, the app contains ads.** (Play then shows "Contains ads" on the listing.)

## Target audience and content

- **Target age groups: 13–15, 16–17 and 18+.** Do not tick any group under
  13. Picking one puts the app under the Families policy, which needs a
  different ads set-up -- child-directed ad requests and only the ad
  settings Google certifies for families -- that this build does not have.
- "Could your app unintentionally appeal to children?" — answer honestly.
  If Play decides it does, it will ask for changes; the usual one is to
  initialise AdMob with `tagForChildDirectedTreatment` /
  `tagForUnderAgeOfConsent`, which `game/js/ads.js` can pass to
  `AdMob.initialize()`.
- The game caps ad content at **Parental Guidance** (`ADS.maxContentRating`
  in `game/js/config.js`).

## Content rating questionnaire

Answer "no" to every violence, sexuality, language, controlled-substance,
gambling and user-interaction question. The game is vehicles on a road with no
depiction of injury, no characters in conflict, no chat and no purchases.
Ads are not part of the IARC rating, so this should still come out at the
lowest band (PEGI 3 / ESRB Everyone / 3+).
