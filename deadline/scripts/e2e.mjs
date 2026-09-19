/**
 * End-to-end smoke test.
 *
 * Boots the game server and the built web app, drives a real Chromium through
 * the MVP flow — landing → guest sign-in → main menu → deploy → raid HUD →
 * loot → extract → post-match — and fails loudly on console errors.
 *
 * Run with: pnpm test:e2e
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PORT = 2588;
const WEB_PORT = 3010;
const DEMO_DB = join(root, '.deadline-demo', 'e2e.json');
const SHOTS = join(root, '.deadline-demo', 'screenshots');

const processes = [];
const consoleErrors = [];

function start(name, command, args, env, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.log(`[${name}] ${text.split('\n').slice(-2).join(' ')}`);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error(`[${name}!] ${text.split('\n').slice(-2).join(' ')}`);
  });
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
      // not yet
    }
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main() {
  await rm(DEMO_DB, { force: true });
  await mkdir(SHOTS, { recursive: true });

  console.log('▸ starting game server');
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
      BOT_COUNT: '2',
      MIN_PLAYERS_TO_START: '1',
      LOBBY_FILL_SECONDS: '0',
      COUNTDOWN_SECONDS: '1',
      MATCH_DURATION_SECONDS: '180',
      EXTRACTION_TIME_SECONDS: '1',
      MAX_AI_ENEMIES: '10',
      CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      LOG_LEVEL: 'warn',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    join(root, 'apps/game-server'),
  );
  await waitForHttp(`http://127.0.0.1:${SERVER_PORT}/health`);
  console.log('  ✓ game server healthy');

  console.log('▸ starting web app');
  start(
    'web',
    join(root, 'apps/web/node_modules/.bin/next'),
    ['start', '--port', String(WEB_PORT)],
    {
      NODE_ENV: 'production',
      NEXT_PUBLIC_GAME_SERVER_URL: `ws://127.0.0.1:${SERVER_PORT}`,
      NEXT_PUBLIC_DEMO_MODE: 'true',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      DEMO_DB_PATH: DEMO_DB,
    },
    join(root, 'apps/web'),
  );
  await waitForHttp(`http://127.0.0.1:${WEB_PORT}/`);
  console.log('  ✓ web app responding');

  // Playwright's bundled Chromium lives under PLAYWRIGHT_BROWSERS_PATH here;
  // fall back to its own resolution when that layout is absent.
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ];
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 810 } });
  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    console.log('▸ landing page');
    await page.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: 'networkidle' });
    assert(await page.locator('text=Get out.').isVisible(), 'landing page renders the tagline');
    await page.screenshot({ path: join(SHOTS, '01-landing.png') });

    console.log('▸ guest sign-in');
    await page.goto(`http://127.0.0.1:${WEB_PORT}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="username"]', 'E2ERUNNER');
    await page.screenshot({ path: join(SHOTS, '02-login.png') });
    await Promise.all([
      page.waitForURL('**/menu', { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ]);
    assert(page.url().endsWith('/menu'), 'guest sign-in lands on the main menu');

    console.log('▸ main menu');
    await page.click('text=Understood').catch(() => undefined);
    await page.waitForTimeout(500);
    assert(await page.locator('text=SECTOR ZERO').first().isVisible(), 'menu shows the operation');
    assert(await page.locator('text=10,000').first().isVisible(), 'starting credits are granted');
    await page.screenshot({ path: join(SHOTS, '03-menu.png') });

    console.log('▸ market');
    await page.goto(`http://127.0.0.1:${WEB_PORT}/market`, { waitUntil: 'networkidle' });
    assert(await page.locator('text=VENDOR STOCK').isVisible(), 'market lists vendor stock');
    const buyButton = page.locator('button:has-text("Buy")').first();
    await buyButton.click();
    await page.waitForTimeout(1200);
    assert(
      (await page.locator('text=/Purchased/').count()) > 0,
      'buying an item reports a server-validated purchase',
    );
    await page.screenshot({ path: join(SHOTS, '04-market.png') });

    console.log('▸ loadout');
    await page.goto(`http://127.0.0.1:${WEB_PORT}/loadout`, { waitUntil: 'networkidle' });
    assert(await page.locator('text=PRIMARY WEAPON').isVisible(), 'loadout screen renders');
    await page.screenshot({ path: join(SHOTS, '05-loadout.png') });

    console.log('▸ deploying into a raid');
    await page.goto(`http://127.0.0.1:${WEB_PORT}/play`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => document.querySelector('canvas') !== null, { timeout: 30_000 });
    await page.waitForFunction(
      () => document.body.innerText.includes('DEADLINE') && document.body.innerText.includes('HEALTH'),
      { timeout: 60_000 },
    );
    assert(true, 'raid HUD is live (health, armour, deadline)');

    // Let the raid run so the world spawns, bots move and the clock ticks.
    await page.waitForTimeout(5_000);
    await page.screenshot({ path: join(SHOTS, '06-raid.png') });

    const hud = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasExits: text.includes('YOUR EXITS'),
        hasAmmo: /\d+\s*\/\s*\d+/.test(text),
        hasStamina: text.includes('STAMINA'),
      };
    });
    assert(hud.hasExits, 'HUD shows the operator’s assigned extractions');
    assert(hud.hasAmmo, 'HUD shows the weapon and ammunition counter');
    assert(hud.hasStamina, 'HUD shows the stamina bar');

    console.log('▸ moving, shooting and looting');
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 720, y: 400 } });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(SHOTS, '07-combat.png') });

    // The debug panel's teleport is the only way to cross 200 m in a smoke test.
    await page.keyboard.press('Backquote');
    await page.waitForTimeout(400);
    const debugVisible = await page.locator('text=DEBUG — DEV ONLY').isVisible();
    assert(debugVisible, 'development debug panel is available');
    await page.screenshot({ path: join(SHOTS, '08-debug.png') });

    // Heal first: the sector is hostile and this is a flow test, not a
    // survival test. Then teleport to an assigned exit via the debug panel.
    await page.click('button:has-text("Heal + full armour")');
    await page.waitForTimeout(400);
    const exitName = await page.evaluate(() => {
      const match = document.body.innerText.match(/YOUR EXITS\n([A-Z ]+)/);
      return match ? match[1].trim() : 'SUBWAY EXIT';
    });
    const debugPanel = page.locator('div:has(> h3:text("DEBUG — DEV ONLY"))');
    await debugPanel.locator(`button:has-text("${exitName.split(' ')[0]}")`).first().click();
    await page.waitForTimeout(1500);
    await page.keyboard.press('KeyX');
    await page.waitForFunction(() => document.body.innerText.includes('EXTRACTED'), {
      timeout: 40_000,
    });
    assert(true, 'extraction completes and the post-match report appears');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(SHOTS, '09-postmatch.png') });

    const report = await page.evaluate(() => document.body.innerText);
    assert(report.includes('XP EARNED'), 'post-match report shows XP earned');
    assert(report.includes('LOOT EXTRACTED'), 'post-match report shows extracted loot value');

    console.log('▸ returning to the menu');
    await page.click('text=Return to menu');
    await page.waitForURL('**/menu', { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const menuText = await page.evaluate(() => document.body.innerText);
    assert(menuText.includes('EXTRACTED'), 'the raid shows up in recent raids');
    await page.screenshot({ path: join(SHOTS, '10-menu-after.png') });

    console.log('▸ stash');
    await page.goto(`http://127.0.0.1:${WEB_PORT}/stash`, { waitUntil: 'networkidle' });
    const stashText = await page.evaluate(() => document.body.innerText);
    assert(!stashText.includes('Nothing here yet'), 'extracted gear landed in the stash');
    await page.screenshot({ path: join(SHOTS, '11-stash.png') });

    // Sandboxed CI has no outbound TLS trust for fonts.googleapis.com, and
    // software WebGL is noisy. Neither is an application fault.
    const fatal = consoleErrors.filter(
      (text) =>
        !text.includes('Download the React DevTools') &&
        !text.includes('favicon') &&
        !text.includes('WebGL') &&
        !text.includes('SwiftShader') &&
        !text.includes('ERR_CERT_AUTHORITY_INVALID') &&
        !text.includes('ERR_BLOCKED_BY_CLIENT'),
    );
    if (fatal.length > 0) {
      console.error('\nConsole errors:');
      for (const error of fatal.slice(0, 10)) console.error(`  · ${error}`);
      throw new Error(`${fatal.length} console error(s) during the run`);
    }
    assert(true, 'no console errors during the whole flow');

    await writeFile(
      join(SHOTS, 'result.json'),
      JSON.stringify({ ok: true, at: new Date().toISOString() }, null, 2),
    );
    console.log('\n✅ END-TO-END FLOW PASSED');
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main()
  .then(() => {
    for (const child of processes) child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 500);
  })
  .catch((error) => {
    console.error('\n❌ END-TO-END FLOW FAILED');
    console.error(error);
    for (const child of processes) child.kill('SIGTERM');
    setTimeout(() => process.exit(1), 500);
  });
