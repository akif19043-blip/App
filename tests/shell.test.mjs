/**
 * App-shell tests: language, the quality watchdog, onboarding and settings.
 *
 *     node tests/shell.test.mjs
 *
 * These are the parts that decide what a player sees before they have driven a
 * metre, and the parts that decide whether the game is playable on a phone we
 * cannot test on.
 */

import { chromium } from 'playwright';

const URL = (process.env.GAME_URL || 'http://localhost:8000') + '/index.html';
const KEY = 'dortyol.profile.v1';

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
         '--disable-dev-shm-usage'],
});
const problems = [];

async function open(locale = 'tr-TR') {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, locale, hasTouch: true, isMobile: true,
  });
  page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('CONSOLE ' + m.text());
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.getElementById('screen-menu')?.classList.contains('is-visible'),
    { timeout: 120000 });
  return page;
}

// --- language --------------------------------------------------------------
{
  const tr = await open('tr-TR');
  const en = await open('en-GB');
  const read = (page) => page.evaluate(() => ({
    lang: document.documentElement.lang,
    play: document.querySelector('#btn-play-city span').textContent,
    garage: document.getElementById('btn-garage').textContent.trim(),
    title: document.title,
  }));
  const turkish = await read(tr);
  const english = await read(en);
  console.log('   locales:', JSON.stringify({ turkish, english }));
  check('a Turkish device gets Turkish',
        turkish.lang === 'tr' && turkish.garage === 'GARAJ');
  check('an English device gets English',
        english.lang === 'en' && english.garage === 'GARAGE');
  check('the title carries the brand', english.title.startsWith('Dörtyol'));

  // switching in settings re-renders the screens that build text at runtime
  await en.click('#btn-settings');
  await en.waitForTimeout(200);
  await en.click('.lang__option:not(.is-on)');
  await en.waitForTimeout(300);
  const switched = await en.evaluate(() => ({
    lang: document.documentElement.lang,
    back: document.getElementById('btn-settings-back').textContent.trim(),
    saved: JSON.parse(localStorage.getItem('dortyol.profile.v1')).settings.language,
  }));
  console.log('   switched:', JSON.stringify(switched));
  check('switching language takes effect immediately',
        switched.lang === 'tr' && switched.back === 'GERİ');
  check('the language choice is saved', switched.saved === 'tr');

  // and a garage rendered in one language re-renders in the other
  await en.click('#btn-settings-back');
  await en.click('#btn-garage');
  await en.waitForTimeout(300);
  const card = await en.evaluate(() =>
    document.querySelector('.car-card__action').textContent.trim());
  check('the garage follows the language', card === 'SEÇİLİ', card);
  await tr.close();
  await en.close();
}

// --- quality watchdog ------------------------------------------------------
{
  const page = await open();
  await page.click('#btn-play-city');
  await page.waitForTimeout(400);
  const quality = await page.evaluate(() => {
    const q = game.quality;
    const out = { start: q.level.id };
    // a device holding 60fps must never be downgraded
    for (let i = 0; i < 3000; i += 1) q.sample(1 / 60);
    out.afterFast = q.level.id;
    // a device stuck at 18fps must be
    for (let i = 0; i < 400; i += 1) q.sample(1 / 18);
    out.afterSlow = q.level.id;
    out.shadows = game.renderer.shadowMap.enabled;
    out.pedestrians = game.session.pedestrians.visible;
    out.fogFar = Math.round(game.session.scene.fog.far);
    // and it must not creep back up on its own afterwards
    for (let i = 0; i < 3000; i += 1) q.sample(1 / 120);
    out.afterRecovery = q.level.id;
    out.saved = JSON.parse(localStorage.getItem('dortyol.profile.v1'))
      .settings.quality;
    return out;
  });
  console.log('   quality:', JSON.stringify(quality));
  check('a fast device is left alone', quality.afterFast === 'high');
  check('a slow device is stepped down', quality.afterSlow !== 'high');
  check('stepping down turns shadows off', quality.shadows === false);
  check('stepping down thins the crowd', quality.pedestrians < 14,
        quality.pedestrians + ' pedestrians');
  check('stepping down pulls the draw distance in', quality.fogFar < 420);
  check('it never climbs back on its own',
        quality.afterRecovery === quality.afterSlow);
  check('the level is remembered', quality.saved === quality.afterSlow);
  await page.close();
}

// --- onboarding ------------------------------------------------------------
{
  const page = await open();
  await page.click('#btn-play-city');
  await page.waitForTimeout(500);
  const first = await page.evaluate(() => ({
    shown: document.getElementById('tutorial').classList.contains('is-visible'),
    text: document.getElementById('tutorial-text').textContent,
  }));
  check('the first run explains the controls', first.shown && first.text.length > 10,
        first.text);
  await page.click('#btn-tutorial');
  await page.waitForTimeout(200);
  check('the hint can be dismissed', await page.evaluate(() =>
    !document.getElementById('tutorial').classList.contains('is-visible')));

  // second time into the same mode: no hint
  await page.click('#btn-pause');
  await page.waitForTimeout(200);
  await page.click('#btn-quit');
  await page.waitForTimeout(300);
  await page.click('#btn-play-city');
  await page.waitForTimeout(400);
  check('it does not nag on the second run', await page.evaluate(() =>
    !document.getElementById('tutorial').classList.contains('is-visible')));
  await page.close();
}

// --- settings persist ------------------------------------------------------
{
  const page = await open();
  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  await page.click('#toggle-shadows');
  await page.click('#toggle-music');
  await page.click('#toggle-lefthanded');
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => ({
    shadows: game.renderer.shadowMap.enabled,
    lefty: document.body.classList.contains('is-left-handed'),
    saved: JSON.parse(localStorage.getItem('dortyol.profile.v1')).settings,
  }));
  console.log('   settings:', JSON.stringify(applied.saved));
  check('turning shadows off takes effect', applied.shadows === false);
  check('the left-handed layout mirrors the controls', applied.lefty);
  check('settings are saved', applied.saved.shadows === false
        && applied.saved.music === false && applied.saved.leftHanded === true);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    () => document.getElementById('screen-menu')?.classList.contains('is-visible'),
    { timeout: 120000 });
  const restored = await page.evaluate(() => ({
    shadows: game.renderer.shadowMap.enabled,
    lefty: document.body.classList.contains('is-left-handed'),
    checkbox: document.getElementById('toggle-shadows').checked,
  }));
  check('settings survive a restart',
        restored.shadows === false && restored.lefty && !restored.checkbox);
  await page.close();
}

await browser.close();
if (problems.length) {
  failures += 1;
  console.log(problems.slice(0, 6).join('\n'));
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
