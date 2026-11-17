// render.html'i başsız Chromium'da açıp her görünümün ekran görüntüsünü alır.
// Kullanım: node tools/preview/shoot.cjs <render klasörü> <çıktı klasörü>
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { setTimeout: sleep } = require("node:timers/promises");

(async () => {

const [root, out] = process.argv.slice(2);
const server = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
await sleep(800);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const view of (process.env.VIEWS || "overview,village,hip,ads,lineup").split(",")) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
    page.on("pageerror", (e) => console.error(view, e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console.error(view, m.text().slice(0, 400));
    });
    await page.goto(`http://127.0.0.1:8765/render.html?view=${view}`);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
    await page.screenshot({ path: `${out}/${view}.png` });
    console.log("çekildi:", view);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
})();
