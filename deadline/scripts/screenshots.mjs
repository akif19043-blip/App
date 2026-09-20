/**
 * Visual capture helper.
 *
 * Boots the stack, drops into a raid and photographs the game from a few
 * points of interest. Used while tuning lighting, framing and HUD layout.
 *
 * Run with: node scripts/screenshots.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PORT = 2591;
const WEB_PORT = 3011;
const DEMO_DB = join(root, '.deadline-demo', 'shots.json');
const OUT = join(root, '.deadline-demo', 'visuals');

const processes = [];

function start(name, command, args, env, cwd) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'ignore' });
  processes.push(child);
  return child;
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 307 || response.status === 404) return;
    } catch {
      /* not yet */
    }
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function main() {
  await rm(DEMO_DB, { force: true });
  await mkdir(OUT, { recursive: true });

  start(
    'server',
    process.execPath,
    ['dist/index.js'],
    {
      NODE_ENV: 'development',
      GAME_SERVER_PORT: String(SERVER_PORT),
      DEMO_DB_PATH: DEMO_DB,
      ALLOW_DEMO_AUTH: 'true',
      ENABLE_BOTS: 'true',
      BOT_COUNT: '3',
      MIN_PLAYERS_TO_START: '1',
      LOBBY_FILL_SECONDS: '0',
      COUNTDOWN_SECONDS: '1',
      MATCH_DURATION_SECONDS: '600',
      MAX_AI_ENEMIES: '12',
      LOG_LEVEL: 'error',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    join(root, 'apps/game-server'),
  );
  await waitForHttp(`http://127.0.0.1:${SERVER_PORT}/health`);

  start(
    'web',
    join(root, 'apps/web/node_modules/.bin/next'),
    ['start', '--port', String(WEB_PORT)],
    {
      NODE_ENV: 'production',
      NEXT_PUBLIC_GAME_SERVER_URL: `ws://127.0.0.1:${SERVER_PORT}`,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      DEMO_DB_PATH: DEMO_DB,
    },
    join(root, 'apps/web'),
  );
  await waitForHttp(`http://127.0.0.1:${WEB_PORT}/`);

  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ];
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  try {
    await page.goto(`http://127.0.0.1:${WEB_PORT}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="username"]', 'SHOTRUNNER');
    await Promise.all([page.waitForURL('**/menu'), page.click('button[type="submit"]')]);
    await page.click('text=Understood').catch(() => undefined);

    await page.goto(`http://127.0.0.1:${WEB_PORT}/play`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.innerText.includes('HEALTH') && document.body.innerText.includes('DEADLINE'),
      { timeout: 60_000 },
    );
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: join(OUT, 'spawn.png') });

    await page.keyboard.press('Backquote');
    await page.waitForTimeout(500);

    const panel = page.locator('div:has(> h3:text("DEBUG — DEV ONLY"))');
    for (const district of [
      'Market Street',
      'Police Station',
      'Warehouse District',
      'Train Station',
      'Apartment Blocks',
      'Underground Bunker',
    ]) {
      const button = panel
        .locator('button', { hasText: new RegExp(`^${district}$`, 'i') })
        .first();
      if ((await button.count()) === 0) continue;
      // These districts are guarded; top up on arrival as well as departure,
      // otherwise the capture run keeps ending in a post-match screen.
      const heal = panel.locator('button:has-text("Heal + full armour")');
      await heal.click({ force: true });
      await button.click({ force: true });
      await page.waitForTimeout(1_800);
      await heal.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(700);
      await page.screenshot({
        path: join(OUT, `${district.toLowerCase().replace(/\s+/g, '-')}.png`),
      });
    }

    // Loot window + inventory.
    await page.locator('button:has-text("Spawn loot crate")').click();
    await page.waitForTimeout(1_200);
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: join(OUT, 'loot.png') });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, 'inventory.png') });

    console.log(`screenshots written to ${OUT}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main()
  .then(() => {
    for (const child of processes) child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 400);
  })
  .catch((error) => {
    console.error(error);
    for (const child of processes) child.kill('SIGTERM');
    setTimeout(() => process.exit(1), 400);
  });
