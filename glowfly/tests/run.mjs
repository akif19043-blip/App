/**
 * Serve the game and run every suite against it in headless Chromium.
 *
 *     npm test            (from glowfly/)
 *
 * Set CHROME_PATH if Playwright cannot find a browser on its own.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = ['sim.test.mjs', 'game.test.mjs', 'portals.test.mjs', 'layout.test.mjs'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch (err) {
    response.writeHead(404).end();
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;

function chromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(join(root, 'chromium'))) return join(root, 'chromium');
  return '';
}

const shots = join(ROOT, '.test-shots');
mkdirSync(shots, { recursive: true });
let failed = 0;
for (const suite of SUITES) {
  console.log(`\n=== ${suite} ===`);
  const child = spawn(process.execPath, [join(ROOT, 'tests', suite)], {
    stdio: 'inherit',
    env: { ...process.env, GAME_URL: url, SHOT_DIR: shots, CHROME_PATH: chromium() },
  });
  const [code] = await once(child, 'exit');
  if (code) failed += 1;
}
server.close();
console.log(failed ? `\n${failed} suite(s) failed` : '\nall suites passed');
process.exit(failed ? 1 : 0);
