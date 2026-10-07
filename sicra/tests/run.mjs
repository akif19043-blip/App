/**
 * Test runner: starts the static server, runs every suite against it, and
 * reports a single pass/fail.
 *
 *     npm test
 *
 * Set CHROME_PATH if Chromium lives somewhere Playwright cannot find it.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8124;
const URL = `http://localhost:${PORT}`;
const ALL = ['game.test.mjs', 'shell.test.mjs', 'layout.test.mjs'];
const SUITES = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return '';
  if (existsSync(join(root, 'chromium'))) return join(root, 'chromium');
  const build = readdirSync(root).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
  const candidate = build && join(root, build, 'chrome-linux', 'chrome');
  return candidate && existsSync(candidate) ? candidate : '';
}

const CHROME = findChromium();
if (CHROME) console.log('using chromium at ' + CHROME);

const SHOT_DIR = join(ROOT, '.test-shots');
mkdirSync(SHOT_DIR, { recursive: true });

const server = spawn('python3', [join(ROOT, 'tools', 'serve.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });

async function waitForServer(attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${URL}/index.html`);
      if (response.ok) return true;
    } catch (err) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function runSuite(name) {
  const child = spawn(process.execPath, [join(ROOT, 'tests', name)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, GAME_URL: URL, SHOT_DIR, ...(CHROME ? { CHROME_PATH: CHROME } : {}) },
  });
  return once(child, 'exit').then(([code]) => code);
}

let failed = 0;
try {
  if (!await waitForServer()) {
    console.error('server did not start on ' + URL);
    process.exit(1);
  }
  for (const suite of SUITES) {
    console.log(`\n=== ${suite} ===`);
    if (await runSuite(suite)) failed += 1;
  }
} finally {
  server.kill();
}

console.log(failed ? `\n${failed} suite(s) failed` : '\nall suites passed');
process.exit(failed ? 1 : 0);
