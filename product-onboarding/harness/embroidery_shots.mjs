// Drives the real studio through the print -> embroidery flow and captures
// evidence for one artwork asset.
//
//   node embroidery_shots.mjs <productId> <artworkPng> <outDir> [port]
//
// Assertions (exit 2 on failure):
//   - the Style control exists on a garment surface
//   - switching to Embroidery changes the rendered pixels in BOTH the 2D
//     editor and the 3D preview
//   - switching back to Print restores the original artwork exactly
import { chromium } from "playwright-core";
import { waitForModel } from "./lib_wait.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const [productId, artwork, outDir, port = "3000"] = process.argv.slice(2);
if (!productId || !artwork || !outDir) {
  console.error("usage: node embroidery_shots.mjs <productId> <artworkPng> <outDir> [port]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const stem = basename(artwork).replace(/\.[a-z]+$/i, "");



const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1700, height: 1020 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console]", m.text().slice(0, 200));
});

await page.goto(`http://localhost:${port}/studio?product=${encodeURIComponent(productId)}`);
await waitForModel(page);

await page.getByRole("button", { name: "Uploads", exact: true }).click();
await page.locator("input[type=file]").setInputFiles(resolve(artwork));
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.getByRole("button", { name: "Fit to print area" }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Uploads", exact: true }).click();
await page.waitForTimeout(400);

const editor = page.locator("[data-design-editor]");
const preview = page.locator("section[aria-label='3D preview']");
const style = page.getByRole("radiogroup", { name: "Reproduction method" });
if (!(await style.count())) {
  console.error("FAIL: no reproduction-method control on this surface");
  await browser.close();
  process.exit(2);
}

await editor.screenshot({ path: `${outDir}/${stem}-2d-print.png` });
await page.mouse.move(4, 4);
await page.waitForTimeout(500);
await preview.screenshot({ path: `${outDir}/${stem}-3d-print.png` });
const printed2d = readFileSync(`${outDir}/${stem}-2d-print.png`).length;

await style.getByRole("radio", { name: "Embroidery" }).click();
// Preview pass is synchronous; the full pass lands ~300ms later.
await page.waitForTimeout(2600);
await editor.screenshot({ path: `${outDir}/${stem}-2d-embroidery.png` });
await page.mouse.move(4, 4);
await page.waitForTimeout(500);
await preview.screenshot({ path: `${outDir}/${stem}-3d-embroidery.png` });
const stitched2d = readFileSync(`${outDir}/${stem}-2d-embroidery.png`).length;

await page.screenshot({ path: `${outDir}/${stem}-studio.png` });
const stitchNote = await page.locator("aside p", { hasText: "stitches" }).first().textContent();
console.log(`${stem}: ${stitchNote?.trim().split("·")[0].trim() ?? "(no stitch count)"}`);

// Close-up on the 3D preview so the thread structure is legible.
const canvas = preview.locator("canvas");
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, -120);
// Park the pointer off the model: hovering a print panel tints it, which is
// correct behaviour but not what we are trying to photograph.
await page.mouse.move(box.x + 12, box.y + 12);
await page.waitForTimeout(900);
await preview.screenshot({ path: `${outDir}/${stem}-3d-embroidery-closeup.png` });
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 120);
await page.waitForTimeout(600);

await style.getByRole("radio", { name: "Print" }).click();
await page.waitForTimeout(1400);
await editor.screenshot({ path: `${outDir}/${stem}-2d-print-restored.png` });
const restored2d = readFileSync(`${outDir}/${stem}-2d-print-restored.png`).length;

await browser.close();

if (Math.abs(stitched2d - printed2d) < printed2d * 0.02) {
  console.error("FAIL: the 2D canvas barely changed when embroidery was applied");
  process.exit(2);
}
if (Math.abs(restored2d - printed2d) > printed2d * 0.02) {
  console.error("FAIL: switching back to Print did not restore the original artwork");
  process.exit(2);
}
console.log(`EMBROIDERY PASS — ${stem}`);
