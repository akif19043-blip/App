/**
 * covers.mjs -- the store images, rendered by the game itself.
 *
 *     node tools/covers.mjs        (with the game served on :8000, or GAME_URL)
 *
 * Stages a moment of the night -- the firefly mid-swarm with every weapon
 * going and a great moth closing in -- puts the logo over it, and saves it at
 * the sizes the portals ask for into store/. Portals change their exact
 * requirements now and then; check the upload form and add a size here if
 * it asks for one that is missing.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store');
const URL = (process.env.GAME_URL || 'http://127.0.0.1:8000') + '/index.html?seed=21';

const SIZES = [
  { name: 'cover-1920x1080', width: 1920, height: 1080, scale: 1.6 },   // 16:9 landscape
  { name: 'cover-1280x720', width: 1280, height: 720, scale: 1.1 },
  { name: 'cover-800x1200', width: 800, height: 1200, scale: 1.25 },    // 2:3 portrait
  { name: 'cover-800x800', width: 800, height: 800, scale: 1.2 },       // square
  { name: 'icon-512', width: 512, height: 512, scale: 2.6, icon: true },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.glowfly && window.glowfly.game.state === 'title');
  await page.click('#btn-play');
  await page.evaluate(({ icon }) => {
    const g = window.glowfly.game;
    const run = g.run;
    // The renderer shows a fixed amount of world; a cover wants it closer.
    run.time = 240;
    run.nextRing = 1e9;
    run.elitesLeft = [];
    run.player.inv = 1e9;
    for (const [id, level] of [['spark', 4], ['halo', 3], ['arc', 3], ['embers', 3]]) {
      run.weapons.set(id, { level, timer: Math.random() });
    }
    run.refreshStats();
    const kinds = ['gnat', 'wasp', 'beetle', 'gnat', 'spitter', 'wasp'];
    const count = icon ? 6 : 70;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const d = (icon ? 88 : 130) + Math.random() * (icon ? 10 : 260);
      const e = run.addEnemy(kinds[i % kinds.length], { x: Math.cos(a) * d, y: Math.sin(a) * d });
      e.speed *= icon ? 0 : 0.2;
    }
    if (!icon) run.addEnemy('moth', { x: 240, y: -40 }).speed = 4;
    for (let i = 0; i < 70; i += 1) {
      const still = icon ? 0 : 0.6;   // the icon's firefly stays in the middle
      window.glowfly.step(1, { x: Math.cos(i / 12) * still, y: Math.sin(i / 15) * still });
      while (g.state === 'level') g.choose(0);
    }
    for (const e of run.enemies) e.hp = e.maxHp;   // no one dies in the photo
    // Leave the band under the logo clear, so the name reads.
    if (!icon) {
      const top = run.player.y - g.renderer.view.h * 0.26;
      run.enemies = run.enemies.filter((e) => e.y > top || e.def.elite);
    }
    g.pause();
    document.querySelectorAll('.screen, .hud, .toast').forEach((el) => {
      el.style.display = 'none';
    });
  }, { icon: !!size.icon });
  await page.evaluate(({ scale, icon }) => {
    const g = window.glowfly.game;
    g.renderer.zoom *= scale;
    g.renderer.view = { w: g.renderer.width / g.renderer.zoom, h: g.renderer.height / g.renderer.zoom };
    g.renderer.numbers = [];
    g.renderer.draw(g.run, 0.016, { numbers: false });
    if (icon) return;
    const title = document.createElement('div');
    title.style.cssText = 'position:fixed;left:0;right:0;top:7%;z-index:9;text-align:center;pointer-events:none';
    const portrait = innerHeight > innerWidth;
    title.innerHTML = `<h1 class="logo" style="font-size:${portrait ? 15 : 13}vmin">GLOWFLY</h1>
      <p class="tagline" style="font-size:${portrait ? 4.2 : 3.2}vmin;color:#dfe6ff;
        text-shadow:0 2px 12px #000">Survive the night. Light the meadow.</p>`;
    document.body.appendChild(title);
  }, { scale: size.scale, icon: !!size.icon });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, size.name + '.png') });
  console.log('wrote store/' + size.name + '.png');
  await page.close();
}

await browser.close();
