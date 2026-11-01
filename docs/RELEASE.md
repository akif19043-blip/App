# Releasing Dörtyol on Google Play

Everything here has been prepared in the repository; what is left is work that
needs an Android SDK, a signing key and a Play Console account — none of which
can live in this repo.

## What is already done

- `android/` — a Capacitor project that bundles the whole game inside the APK.
  The only network traffic is the AdMob SDK loading rewarded ads; the game
  itself plays offline.
- **Rewarded ads** through `@capacitor-community/admob`, wired up and tested
  in the browser with a stand-in back end. They run on Google's **test ids**
  until you put your own in `game/ads.json` — see [Ads](#ads-admob) below.
- App id `com.dortyol.driver`, name **Dörtyol**, `versionCode 1`,
  `versionName 1.0.0`.
- Launcher icons at every density, plus the adaptive icon layers.
- Fullscreen immersive activity that keeps the screen awake.
- `store/` — 512×512 icon, 1024×500 feature graphic, screenshots, listing copy
  in Turkish and English, privacy policy in both, and the Data Safety answers.

## What is NOT verified

**The `.aab` has never been built, and the game has never run on a real
phone.** The environment this was developed in cannot reach `dl.google.com`, so
the Android SDK could not be installed, and it renders with software OpenGL at
about 4 fps, which says nothing about real hardware.

That includes the **ads**. Every reward flow is tested in a browser against a
stand-in ad, but the real AdMob path — the consent form, loading an ad,
showing it, the close and reward events coming back from Android — has only
been written against the plugin's source, never run.

Before you ship, in this order:

1. Open `game/index.html` on your own phone (`npm run serve`, then the URL it
   prints) and drive for a few minutes. If it stutters, the in-game watchdog
   will drop the quality by itself — note whether it does, and whether the
   result is playable.
2. Build a debug APK, install it, and check the same things in the real
   WebView: performance, the immersive bars, rotation, and that vibration works.
   Then the ads, still on the test ids: the green offers appear after a few
   seconds, each one plays a "Test Ad", a watched ad pays, and an ad closed
   early does not (see [Testing on a phone](#testing-on-a-phone)).
3. Only then build the release bundle.

## Building

You need JDK 17+ and the Android SDK (easiest via Android Studio, which also
gives you `npm run android:open`).

```bash
npm install
npm run android:sync      # copy game/ into the Android project
npm run android:debug     # android/app/build/outputs/apk/debug/app-debug.apk
```

Install the debug APK on a phone over USB:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Signing

Create the upload key **once**, and keep both the file and the passwords safe
and backed up. If you lose them you cannot update the app under the same
listing.

```bash
keytool -genkey -v -keystore dortyol-release.jks -keyalg RSA \
        -keysize 2048 -validity 10000 -alias dortyol
```

Then:

```bash
cp android/keystore.properties.example android/keystore.properties
# edit it with the real path and passwords — this file is gitignored
npm run android:release   # android/app/build/outputs/bundle/release/app-release.aab
```

`android/keystore.properties`, `*.jks` and `*.keystore` are all in
`.gitignore`. Keep them that way.

## Play Console

1. **Developer account** — one-off registration fee (25 USD at the time of
   writing).
2. **New app** → name *Dörtyol: City Driver*, category Games → Racing, free.
   Set a **developer website** while you are there: AdMob checks it for
   `app-ads.txt` (step 6 of [Ads](#ads-admob)).
3. **Store listing** — copy from `store/listing-tr.md` and
   `store/listing-en.md`; upload `store/icon-512.png`,
   `store/feature-graphic.png` and the images in `store/screenshots/`.
4. **Privacy policy** — publish `store/privacy-policy-en.md` (and the Turkish
   one) somewhere with a public URL, e.g. GitHub Pages, and paste that URL into
   the console. Replace the contact-email placeholder first.
5. **App content** — Data Safety, content rating, target audience, ads
   declaration: the answers are in `store/data-safety.md`. The short version:
   **contains ads: yes**, target audience **13+ only**, and the five data
   types the AdMob SDK collects.
6. **Testing** — Google requires a stretch of closed testing with real testers
   before a personal developer account can go to production. Check the current
   requirement in the console; at the time of writing it was 12 testers opted
   in for 14 continuous days.
7. **Target API level** — Play requires new apps to target a recent Android
   API: since August 2025 that has been **API 35 or higher**, and it moves up
   every year. `android/variables.gradle` sets `targetSdkVersion = 34`,
   which is what Capacitor 6 supports — so expect the console to **refuse this
   bundle until the project moves to a newer Capacitor** (7 targets 35; check
   which the console wants). That upgrade also moves
   `@capacitor-community/admob` to the matching major version and the ads SDK
   to 24.x. It is the main piece of work left between this repo and the store.

## Shipping an update

```bash
# android/app/build.gradle
versionCode 2            # must increase every upload
versionName "1.1.0"
```

Then `npm run android:release` again and upload the new bundle.

## Things worth deciding before launch

- **The name.** *Dörtyol* was chosen to avoid confusion with Gameloft's
  *Asphalt* racing series, which the previous name sat uncomfortably close to.
  Nobody has run a trademark search; if you plan to invest in the name, do one.
- **The application id** `com.dortyol.driver` is permanent once published.
  Change it now if you would rather it matched a domain you own.

## Ads (AdMob)

The game earns from **rewarded ads only**: the player taps a green button that
says what they get, watches a short video, and gets it. Nothing interrupts
play, and nothing is paid for an ad that was closed early. The offers:

| Where | Reward | Limit |
|---|---|---|
| Main menu, top left | free coins (150, more at higher ranks) | once every 4 minutes |
| Garage, with a damaged car | a free repair | whenever the car is damaged |
| On the road, just after a police fine | the fine back | 9 seconds to take it |
| Traffic Rush result screen | continue the run | once per run |
| Traffic Rush result screen | the run's coins doubled | once per run |

The amounts and limits are in `ADS` in `game/js/config.js`. An offer only
appears once an ad has actually loaded, so with no connection — or in a plain
browser — nobody sees a button that does nothing.

To try the buttons on a computer, open the game with `?ads=fake`
(`http://localhost:8000/?ads=fake`): a stand-in "ad" plays for a moment and
pays. `npm test` runs the same flows in `tests/ads.test.mjs`.

### Setting it up

1. **AdMob account.** Sign up at <https://admob.google.com> with the Google
   account that owns the Play developer account. Fill in **Payments**: the
   payee name, address, tax information and bank account. AdMob pays monthly
   once the balance passes the payment threshold shown there.
2. **Add the app** (Apps → Add app → Android). Say it is *not* on a store yet;
   link it to the Play listing once it is published. Copy the **App ID** —
   it looks like `ca-app-pub-1234567890123456~1234567890` (with a `~`).
3. **Create one ad unit**: Ad units → Add → **Rewarded**. The reward amount
   and name you type there are ignored; the game decides each reward. Copy
   the **ad unit ID** — `ca-app-pub-1234567890123456/1234567890` (with a `/`).
4. **Put both in `game/ads.json`**, replacing Google's test ids:

   ```json
   {
     "appId": "ca-app-pub-1234567890123456~1234567890",
     "rewardedUnitId": "ca-app-pub-1234567890123456/1234567890"
   }
   ```

   That one file feeds both halves: the Android build writes the app id into
   the manifest, and the game reads the ad unit id at start-up. **A release
   build refuses to run while the test ids are still there** — they serve
   ads that pay nothing, and a store build with them would look perfect and
   earn nothing. (`./gradlew bundleRelease -PallowTestAds` overrides it, for
   testing a signed build.)
5. **Consent message.** AdMob → Privacy & messaging → **European
   regulations** → create and publish a message for the app. Without it the
   game cannot ask players in the EEA, UK and Switzerland for consent, and
   ads there are limited. The game shows the form on first launch where it
   is required, and **Settings → Ad privacy choices** lets a player change
   their answer later.
6. **app-ads.txt.** Edit `store/app-ads.txt` with your publisher id
   (AdMob → Settings → Account information) and publish it at the **root** of
   the developer website on your Play listing, e.g.
   `https://example.com/app-ads.txt`. A GitHub Pages *user* site
   (`username.github.io`) works; a project page (`username.github.io/repo`)
   does not, because it is not the root. AdMob limits ad serving to apps it
   cannot verify.
7. **Privacy policy.** `store/privacy-policy-*.md` already describe the ads;
   publish them as in step 4 of the Play Console list.

### Testing on a phone

- A **debug** build with the test ids shows Google's test ads, labelled
  "Test Ad". Tap through one of each offer and check the reward arrives —
  and that closing an ad early pays nothing.
- With your **real** ids, register your phone first (AdMob → Settings →
  **Test devices**) so it gets test ads too. **Never tap the live ads on your
  own phone**: AdMob treats it as invalid traffic and can close the account.
- New ad units can take an hour or so to start filling. "No ad" for a while
  after setting up is normal; the buttons appear once ads arrive.

### What to expect

Rewarded ads pay per completed view, and the rate depends heavily on where
the players are, so there is no honest number to promise. What moves the
total is how many people play every day and how often an offer is worth
taking — the amounts in `ADS` are the lever for the second.

