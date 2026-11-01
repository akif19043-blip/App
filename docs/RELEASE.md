# Releasing Dörtyol on Google Play

Everything here has been prepared in the repository; what is left is work that
needs an Android SDK, a signing key and a Play Console account — none of which
can live in this repo.

## What is already done

- `android/` — a Capacitor project that bundles the whole game inside the APK.
  It makes no network requests at runtime.
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

Before you ship, in this order:

1. Open `game/index.html` on your own phone (`npm run serve`, then the URL it
   prints) and drive for a few minutes. If it stutters, the in-game watchdog
   will drop the quality by itself — note whether it does, and whether the
   result is playable.
2. Build a debug APK, install it, and check the same things in the real
   WebView: performance, the immersive bars, rotation, and that vibration works.
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
3. **Store listing** — copy from `store/listing-tr.md` and
   `store/listing-en.md`; upload `store/icon-512.png`,
   `store/feature-graphic.png` and the images in `store/screenshots/`.
4. **Privacy policy** — publish `store/privacy-policy-en.md` (and the Turkish
   one) somewhere with a public URL, e.g. GitHub Pages, and paste that URL into
   the console. Replace the contact-email placeholder first.
5. **App content** — Data Safety, content rating, target audience, ads
   declaration: the answers are in `store/data-safety.md`.
6. **Testing** — Google requires a stretch of closed testing with real testers
   before a personal developer account can go to production. Check the current
   requirement in the console; at the time of writing it was 12 testers opted
   in for 14 continuous days.
7. **Target API level** — Play requires new apps to target a recent Android
   API. `android/variables.gradle` currently sets `targetSdkVersion = 34`;
   raise it if the console asks for a newer one, then rebuild and re-test.

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
