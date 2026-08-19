// Screenshot the harness for a product: node shoot.mjs <productDirRelToRepo> <outPng> [port]
// Requires a static server at repo root (python3 -m http.server) and Chrome.
import { chromium } from "playwright-core";

const [productDir, outPng, port = "8779"] = process.argv.slice(2);
if (!productDir || !outPng) {
  console.error("usage: node shoot.mjs /product-onboarding/products/<id> out.png [port]");
  process.exit(1);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 1900 } });
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 300)));
const url = `http://localhost:${port}/product-onboarding/harness/harness.html?product=${encodeURIComponent(productDir)}`;
await page.goto(url);
await page.waitForFunction("window.__done === true", null, { timeout: 120000 });
const errText = await page.locator("#err").textContent();
if (errText.trim()) console.log("PAGE ERRORS:", errText.trim());
console.log("title:", await page.title());
await page.screenshot({ path: outPng, fullPage: true });

// Assert: every placement must be visible (magenta logo pixels) in at least
// one of its views. This makes the harness a test, not just a picture.
const results = await page.evaluate("window.__results");
const failures = results.filter(r => Math.max(...Object.values(r.viewCounts)) < 40);
const { writeFileSync } = await import("node:fs");
writeFileSync(outPng.replace(/\.png$/, "-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.surface} (${r.fx},${r.fy}):`,
    Object.entries(r.viewCounts).map(([v, n]) => `${v}=${n}px`).join(" "));
}
await browser.close();
if (failures.length) {
  console.error(`HARNESS FAIL: ${failures.length} placement(s) not visible in any view`);
  process.exit(2);
}
console.log("HARNESS PASS —", outPng);
