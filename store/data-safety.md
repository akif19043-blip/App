# Play Console — Data Safety answers

Fill the Data Safety form with these. Every answer below is true of the code as
it stands; if the app ever gains ads, analytics or a leaderboard, they change.

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | N/A — no data is collected or transmitted |
| Do you provide a way for users to request that their data is deleted? | N/A — uninstalling, or clearing app data, removes everything |

Supporting notes, if the review asks:

- The game stores progress in the WebView's local storage, on the device only.
- There is no backend, no account system, no advertising SDK and no analytics
  SDK. The app makes no outbound network requests at runtime.
- `INTERNET` is declared because the app framework (Capacitor) includes it by
  default; nothing in the app uses it.
- `VIBRATE` drives optional haptic feedback and can be turned off in Settings.

## Content rating questionnaire

Answer "no" to every violence, sexuality, language, controlled-substance,
gambling and user-interaction question. The game is vehicles on a road with no
depiction of injury, no characters in conflict, no chat and no purchases. This
should come out at the lowest rating band (PEGI 3 / ESRB Everyone / 3+).

## Ads declaration

**No ads.**
