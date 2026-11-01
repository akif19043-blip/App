/**
 * Copy @capacitor/core into game/vendor/capacitor.
 *
 *     node tools/vendor_capacitor.mjs
 *
 * The game has no build step: it is a folder of ES modules the browser loads
 * as they are. Capacitor's JS half -- the part that turns `AdMob.showRewardVideoAd()`
 * into a message to the native plugin -- is one dependency-free module, so it
 * is vendored the same way three.js is and found through the import map.
 *
 * The native half comes from @capacitor/android, and the two talk over a
 * private protocol, so they have to be the same version. `npm run
 * android:sync` runs this first for exactly that reason.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'node_modules', '@capacitor', 'core');
const TARGET = join(ROOT, 'game', 'vendor', 'capacitor');

const core = readFileSync(join(SOURCE, 'dist', 'index.js'), 'utf8')
  // The map is not shipped; pointing at it only earns a 404 in devtools.
  .replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n');
const { version } = JSON.parse(readFileSync(join(SOURCE, 'package.json'), 'utf8'));
const native = JSON.parse(readFileSync(
  join(ROOT, 'node_modules', '@capacitor', 'android', 'package.json'), 'utf8')).version;

if (version !== native) {
  console.error(`@capacitor/core ${version} does not match @capacitor/android ${native};`
    + ' install matching versions first.');
  process.exit(1);
}

mkdirSync(TARGET, { recursive: true });
writeFileSync(join(TARGET, 'core.js'), core);
writeFileSync(join(TARGET, 'VERSION'), version + '\n');
copyFileSync(join(SOURCE, 'LICENSE'), join(TARGET, 'LICENSE'));
console.log(`vendored @capacitor/core ${version}`);
