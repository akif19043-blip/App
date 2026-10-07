/**
 * Layout tests across orientations and screen sizes: every screen has to
 * fit without horizontal overflow, and the buttons have to stay inside the
 * viewport and be at least thumb-sized.
 *
 *     node tests/layout.test.mjs
 */

import { chromium } from 'playwright';
import { URL, SHOTS, check, failed } from './helpers.mjs';

const VIEWPORTS = [
  { name: 'small phone portrait', width: 360, height: 640 },
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'big phone landscape', width: 932, height: 430 },
  { name: 'tablet portrait', width: 820, height: 1180 },
  { name: 'tablet landscape', width: 1180, height: 820 },
];

const SCREENS = ['menu', 'shop', 'missions', 'settings', 'pause', 'over'];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await page.goto(URL + '/index.html');
await page.waitForFunction(() => window.__sicra && window.__sicra.state === 'menu', null, { timeout: 30000 });

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(150);
  for (const screen of SCREENS) {
    const result = await page.evaluate(({ screen, vp }) => {
      const g = window.__sicra;
      if (screen === 'over') { g.setAuto(false); g.start(1); g.run.coins = 12; g.run.distance = 250; g.player.kill('caught'); g.finish(); }
      else if (screen === 'pause') { g.setAuto(false); g.start(1); g.pause(); }
      else { g.menu(); g.ui.show(screen); }
      const root = document.getElementById('screen-' + screen);
      const bad = [];
      const overflowX = document.documentElement.scrollWidth > vp.width + 1;
      if (overflowX) bad.push('horizontal overflow');
      for (const el of root.querySelectorAll('button, select')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.closest('.is-hidden')) continue;
        if (r.left < -1 || r.right > vp.width + 1 || r.top < -1 || r.bottom > vp.height + 1) {
          // scrollable panels may legitimately extend below the fold
          const scroller = el.closest('.panel__body, .dialog');
          if (!scroller || r.top < -1 || r.left < -1 || r.right > vp.width + 1) bad.push(`${el.id || el.className} outside viewport`);
        }
        if (Math.min(r.width, r.height) < 36) bad.push(`${el.id || el.className} too small (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
      // the headline must be visible on screens that have one
      const h = root.querySelector('h1, h2');
      if (h) {
        const r = h.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vp.height) bad.push('headline off-screen');
      }
      return bad;
    }, { screen, vp });
    check(`${vp.name} · ${screen} fits`, result.length === 0, result.join('; '));
  }
  // HUD readouts and pause button during a run
  await page.evaluate(() => {
    const g = window.__sicra;
    g.setAuto(false);
    g.start(1);
    g.player.grant('magnet', 1);
    g.player.grant('shield', 1);
    g.step(1 / 120, 10);
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const hud = await page.evaluate((vp) => {
    const bad = [];
    for (const id of ['hud-score', 'hud-coins', 'btn-pause', 'power-magnet', 'power-shield']) {
      const r = document.getElementById(id).getBoundingClientRect();
      if (r.width === 0) bad.push(id + ' not shown');
      if (r.left < -1 || r.right > vp.width + 1 || r.top < -1) bad.push(id + ' outside viewport');
    }
    const score = document.getElementById('hud-score').getBoundingClientRect();
    const pause = document.getElementById('btn-pause').getBoundingClientRect();
    if (score.right > pause.left) bad.push('score overlaps pause');
    return bad;
  }, vp);
  check(`${vp.name} · HUD fits`, hud.length === 0, hud.join('; '));
  await page.screenshot({ path: `${SHOTS}/layout-${vp.width}x${vp.height}-run.png` });
  await page.evaluate(() => { window.__sicra.menu(); });
  await page.screenshot({ path: `${SHOTS}/layout-${vp.width}x${vp.height}-menu.png` });
}

await browser.close();
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed');
process.exit(failed() ? 1 : 0);
