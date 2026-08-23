// Measures main-thread blocking while artwork is switched to embroidery.
//
//   node embroidery_perf.mjs <productId> <artworkPng> [port]
//
// Reports every long task (>50ms) attributable to the switch, and whether the
// stitch worker was actually used or the run fell back to the main thread —
// because a silent fallback would look like a regression with no explanation.
import { chromium } from "playwright-core";
import { waitForModel } from "./lib_wait.mjs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const disableWorker = args.includes("--no-worker");
const [productId, artwork, port = "3000"] = args.filter((a) => !a.startsWith("--"));
if (!productId || !artwork) {
  console.error("usage: node embroidery_perf.mjs <productId> <artworkPng> [port]");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1700, height: 1020 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

// `--no-worker` proves the main-thread fallback still stitches on browsers
// without OffscreenCanvas, rather than silently producing nothing.
if (disableWorker) {
  await page.addInitScript(() => {
    delete window.OffscreenCanvas;
  });
}

await page.addInitScript(() => {
  window.__workers = [];
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(url, options) {
      super(url, options);
      window.__workers.push(String(options?.name ?? url));
    }
  };
  window.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__longTasks.push(Math.round(entry.duration));
    }
  }).observe({ entryTypes: ["longtask"] });
});

await page.goto(`http://localhost:${port}/studio?product=${encodeURIComponent(productId)}`);
await waitForModel(page);

await page.getByRole("button", { name: "Uploads", exact: true }).click();
await page.locator("input[type=file]").setInputFiles(resolve(artwork));
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.getByRole("button", { name: "Fit to print area" }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Uploads", exact: true }).click();
await page.waitForTimeout(500);

// Only tasks from here on belong to the stitching run.
await page.evaluate(() => {
  window.__longTasks.length = 0;
});

const started = Date.now();
await page.getByRole("radiogroup", { name: "Reproduction method" })
  .getByRole("radio", { name: "Embroidery" })
  .click();
await page.waitForTimeout(4000);

const { tasks, workers, stitches } = await page.evaluate(() => ({
  tasks: window.__longTasks.slice(),
  workers: window.__workers.slice(),
  stitches:
    document.body.innerText.match(/([\d,]+) stitches/)?.[1] ?? "(none reported)",
}));

const usedWorker = workers.some((w) => w.includes("embroidery-stitch"));
if (disableWorker && usedWorker) {
  console.error("FAIL: the worker ran even though OffscreenCanvas was removed");
  await browser.close();
  process.exit(2);
}
const worst = tasks.length ? Math.max(...tasks) : 0;
const total = tasks.reduce((sum, t) => sum + t, 0);

console.log(`product        ${productId}`);
console.log(`stitches       ${stitches}`);
console.log(`stitch worker  ${usedWorker ? "USED" : "NOT USED (main-thread fallback)"}`);
console.log(`long tasks     ${tasks.length ? tasks.join("ms, ") + "ms" : "none over 50ms"}`);
console.log(`worst block    ${worst}ms`);
console.log(`total blocked  ${total}ms`);
console.log(`wall clock     ${Date.now() - started}ms`);

await browser.close();
if (stitches === "(none reported)") {
  console.error("FAIL: no stitching was produced");
  process.exit(2);
}
