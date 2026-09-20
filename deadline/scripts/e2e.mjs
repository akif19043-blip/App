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
      MAX_AI_ENEMIES: '6',
      CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      LOG_LEVEL: 'info',
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

    console.log('▸ taking control');
    await page.mouse.click(720, 400);
    await page.waitForTimeout(250);

    const debugPanel = page.locator('div:has(> h3:text("DEBUG — DEV ONLY"))');

    /**
     * Clicks a development-panel button. These drive a dev tool rather than
     * assert on UX, and the panel scrolls, so the click is forced past
     * Playwright's actionability checks once the button is in view.
     */
    const debugClick = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      await locator.click({ force: true });
      await page.waitForTimeout(250);
    };

    /**
     * The debug panel hands the cursor back while it is open — which means the
     * player cannot shoot until it is closed again. Every use of it is wrapped
     * so the test drives the game the way a developer actually would.
     */
    const focusWorld = async () => {
      // Raw mouse click: Playwright's actionability checks would stall behind
      // any transient overlay, and all we want is to hand focus back to the
      // canvas so it can re-capture the pointer.
      await page.mouse.click(720, 400);
      await page.waitForTimeout(250);
    };

    /**
     * A starved browser can miss the socket keepalive; the client then takes
     * its held seat back on its own. That is correct behaviour, so the test
     * waits it out rather than treating a recovered drop as a failure.
     */
    const waitForLiveConnection = async (timeoutMs = 25_000) => {
      const started = Date.now();
      for (;;) {
        const reconnecting = await page.evaluate(() =>
          document.body.innerText.includes('RECONNECTING'),
        );
        if (!reconnecting) return;
        if (Date.now() - started > timeoutMs) {
          throw new Error('client never finished reconnecting');
        }
        await page.waitForTimeout(500);
      }
    };

    /**
     * Pointer lock can be dropped by the browser at any time (an alert, a focus
     * change, the page losing visibility). A player just clicks back into the
     * game; so does the test, otherwise a lost lock reads as a broken weapon.
     */
    const ensureWorldFocus = async () => {
      await waitForLiveConnection();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const locked = await page.evaluate(() => document.pointerLockElement !== null);
        if (locked) return;
        await focusWorld();
      }
    };

    const withDebugPanel = async (body) => {
      await waitForLiveConnection();
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(400);
      // Sector Zero keeps sending people to look at the gunfire; top up before
      // each staged step so the run tests the flow, not our survival odds.
      await debugClick(debugPanel.locator('button:has-text("Heal + full armour")'));
      await body();
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(300);
      await ensureWorldFocus();
    };

    await page.keyboard.press('Backquote');
    await page.waitForTimeout(400);
    assert(await debugPanel.isVisible(), 'development debug panel is available');
    await page.screenshot({ path: join(SHOTS, '08-debug.png') });

    const exitName = await page.evaluate(() => {
      const match = document.body.innerText.match(/YOUR EXITS\n([A-Z ]+)/);
      return match ? match[1].trim() : 'SUBWAY EXIT';
    });
    // Districts and exits are listed separately, so an exit name is unambiguous.
    const exitButton = debugPanel.locator('button', {
      hasText: new RegExp(`^${exitName.replace(/\s+/g, '\\s+')}$`, 'i'),
    });
    // Sector Zero is hostile by design: staging the rest of the run on the open
    // ground around an exit keeps this a *flow* test rather than a coin flip on
    // whether a guard finds us mid-assertion.
    await debugClick(exitButton.first());
    await page.waitForTimeout(1_000);
    await page.keyboard.press('Backquote');
    await page.waitForTimeout(300);

    console.log('▸ moving');
    await ensureWorldFocus();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1_200);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(300);

    console.log('▸ shooting');
    // Read the magazine straight off the HUD element rather than scraping the
    // page text — the page has other "N / M" strings on it.
    const readAmmo = async () => {
      return page.evaluate(() => {
        const node = document.querySelector('[data-hud="ammo-mag"]');
        if (!node) return null;
        const value = Number(node.textContent?.trim());
        return Number.isFinite(value) ? value : null;
      });
    };

    // Hold the trigger: a semi-automatic sidearm must fire exactly once.
    await ensureWorldFocus();
    const beforeHold = await readAmmo();
    await page.mouse.down();
    await page.waitForTimeout(1_200);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const afterHold = await readAmmo();
    assert(
      beforeHold !== null && afterHold !== null && beforeHold - afterHold === 1,
      `holding the trigger on a semi-automatic fires once (${beforeHold} → ${afterHold})`,
    );

    // Three distinct pulls must fire three rounds.
    await ensureWorldFocus();
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.down();
      await page.waitForTimeout(500);
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(500);
    const afterClicks = await readAmmo();
    assert(
      afterClicks !== null && afterHold !== null && afterHold - afterClicks === 3,
      `three trigger pulls fire three rounds (${afterHold} → ${afterClicks})`,
    );

    await page.keyboard.press('KeyR');
    await page.waitForTimeout(2_500);
    const afterReload = await readAmmo();
    assert(
      afterReload !== null && afterClicks !== null && afterReload > afterClicks,
      `reloading refills the magazine (${afterClicks} → ${afterReload})`,
    );
    await page.screenshot({ path: join(SHOTS, '07-combat.png') });

    console.log('▸ looting');
    await withDebugPanel(async () => {
      await debugClick(debugPanel.locator('button:has-text("Spawn loot crate")'));
      await page.waitForTimeout(600);
    });
    await ensureWorldFocus();
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => document.body.innerText.includes('CONTAINER'), {
      timeout: 20_000,
    });
    assert(true, 'searching a container opens its contents');
    await page.screenshot({ path: join(SHOTS, '12-loot.png') });

    // The HUD's bag readout is the authoritative "did that actually work".
    const readBagValue = async () => {
      return page.evaluate(() => {
        const node = document.querySelector('[data-hud="bag-value"]');
        const match = node?.textContent?.match(/([\d,]+)/);
        return match ? Number(match[1].replace(/,/g, '')) : null;
      });
    };
    const bagBefore = await readBagValue();

    await page.click('button:has-text("Take all")');
    await page.waitForTimeout(2_000);
    const bagAfter = await readBagValue();
    assert(
      bagAfter !== null && bagBefore !== null && bagAfter > bagBefore,
      `taking loot moves it into the backpack (${bagBefore} → ${bagAfter} CR)`,
    );

    await page.keyboard.press('Tab');
    await page.waitForTimeout(900);
    const bagText = await page.evaluate(() => document.body.innerText);
    assert(/BACKPACK — 8×6/.test(bagText), 'the grid inventory opens during the raid');
    assert(
      /MEDICAL KIT|GOLD WATCH/i.test(bagText),
      'the looted stacks are laid out in the grid',
    );
    await page.screenshot({ path: join(SHOTS, '13-inventory.png') });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    console.log('▸ extracting');
    await withDebugPanel(async () => {
      await debugClick(exitButton.first());
      await page.waitForTimeout(1_000);
    });
    await ensureWorldFocus();
    await page.keyboard.press('KeyX');
    await page.waitForFunction(() => document.body.innerText.includes('EXTRACTED'), {
      timeout: 40_000,
    });
    assert(true, 'extraction completes and the post-match report appears');
    await page.waitForTimeout(1_200);
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
  } catch (failure) {
    // A failing browser run is almost impossible to diagnose from a stack
    // trace alone; capture what was actually on screen.
    await page
      .screenshot({ path: join(SHOTS, 'failure.png') })
      .catch(() => undefined);
    const visible = await page
      .evaluate(() => ({
        text: document.body.innerText.slice(0, 600),
        pointerLocked: document.pointerLockElement !== null,
        overlays: [...document.querySelectorAll('.pointer-events-auto')].map(
          (node) => node.textContent?.slice(0, 40) ?? '',
        ),
      }))
      .catch(() => null);
    if (visible) {
      console.error('\n--- page state at failure ---');
      console.error(`pointerLocked=${visible.pointerLocked}`);
      console.error(`overlays=${JSON.stringify(visible.overlays)}`);
      console.error(visible.text.replace(/\n/g, ' | '));
      console.error('--- end page state ---\n');
    }
    throw failure;
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
