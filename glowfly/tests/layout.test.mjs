/**
 * Every screen, at its fullest, on every shape of screen a portal shows the
 * game in: phones both ways up, a tablet, the iframe on a desktop page.
 *
 *     node tests/layout.test.mjs
 *
 * Pure DOM measurement: nothing may need scrolling, nothing may hang off
 * the edge, and the HUD must stay one tidy strip.
 */

import { launch, open, check, finish, SHOTS } from './harness.mjs';

const VIEWPORTS = [
  { name: 'small phone', width: 360, height: 640 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'portal iframe', width: 960, height: 540 },
  { name: 'desktop', width: 1366, height: 768 },
];

const browser = await launch();
const page = await open(browser);

// Fill every screen with the most it can ever hold: all shop items, three
// cards with the reroll offer, and both ad buttons on the result screen.
await page.click('#btn-play');
await page.evaluate(() => {
  const g = window.glowfly.game;
  g.run.pendingLevels = 1;
  g.enterLevel();
  g.ui.over({ summary: { time: 599, level: 99, kills: 123456, won: false }, gold: 99999,
              newBest: true, canRevive: true, doubleGold: 99999 });
  document.getElementById('btn-free-gold').classList.remove('is-hidden');
  window.glowfly.save.get().gold = 123456;
  g.ui.renderShop();
  g.ui.levelUp(g.run.offerChoices(), true);
  g.ui.show(null);
});

for (const viewport of VIEWPORTS) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(200);
  const label = `${viewport.name} (${viewport.width}x${viewport.height})`;
  const report = await page.evaluate(() => {
    const out = { overflow: [], offscreen: [] };
    for (const id of ['title', 'level', 'pause', 'over', 'shop', 'settings']) {
      const screen = document.getElementById('screen-' + id);
      screen.classList.add('is-visible');
      if (screen.scrollHeight > screen.clientHeight + 1) out.overflow.push(id);
      for (const el of screen.querySelectorAll('button, .card, .item')) {
        if (el.closest('.is-hidden')) continue;
        const box = el.getBoundingClientRect();
        if (box.left < -0.5 || box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5) {
          out.offscreen.push(`${id}:${el.id || el.className}`);
        }
      }
      screen.classList.remove('is-visible');
    }
    const hud = document.getElementById('hud').getBoundingClientRect();
    const pause = document.getElementById('btn-pause').getBoundingClientRect();
    out.hud = Math.round(hud.height);
    out.pauseInside = pause.right <= innerWidth + 0.5 && pause.top >= 0;
    return out;
  });
  check(`${label}: every screen fits`, !report.overflow.length, report.overflow.join(','));
  check(`${label}: nothing hangs off the edge`, !report.offscreen.length, report.offscreen.slice(0, 4).join(','));
  check(`${label}: the HUD stays a strip`, report.hud < 110 && report.pauseInside, `${report.hud}px`);

  for (const id of ['title', 'level', 'over']) {
    await page.evaluate((name) => {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-visible', s.id === 'screen-' + name));
    }, id);
    await page.screenshot({ path: `${SHOTS}/layout-${viewport.width}x${viewport.height}-${id}.png` });
  }
  await page.evaluate(() => document.querySelectorAll('.screen').forEach((s) => s.classList.remove('is-visible')));
}

await browser.close();
finish();
