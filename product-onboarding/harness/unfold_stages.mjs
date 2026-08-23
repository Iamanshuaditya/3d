// Walks the studio's progressive-unfold control and screenshots every stage.
//
//   node unfold_stages.mjs <productId> <outDir> [port]
//
// Requires `npm run dev` at the repo root and Chrome. Doubles as an assertion:
// the run fails if the control does not exist, if the step counter does not
// advance on every click, or if the sequence does not end fully unfolded.
//
// Diagnostic artwork is seeded through the studio's OWN persistence key rather
// than by driving the upload UI, so the run exercises the real design-document
// -> canvas -> CanvasTexture path while placing one asymmetric label at each
// panel's exact dieline position. Mirrored, rotated or drifting UVs are then
// visible to a human at a glance.
import { chromium } from "playwright-core";
import { waitForModel } from "./lib_wait.mjs";
import { mkdirSync } from "node:fs";

const [productId, outDir, port = "3000"] = process.argv.slice(2);
if (!productId || !outDir) {
  console.error("usage: node unfold_stages.mjs <productId> <outDir> [port]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// Mailer dieline, millimetres (mirrors src/lib/configurator/mailer-box-spec.ts).
const X0 = 8, H = 60, W = 240, D = 160, TUCK = 42, ROLL = 54, DUST = 38;
const XM = X0 + H, XR = XM + W;
const DIELINE_W = XR + H + X0;
const yTuck = 8, yLidTop = yTuck + TUCK, yBack = yLidTop + D, yBase = yBack + H;
const yFront = yBase + D, yRoll = yFront + H;
const DIELINE_H = yRoll + ROLL + 8;

const PANELS = [
  ["BASE", XM, yBase, W, D], ["BACK", XM, yBack, W, H], ["FRONT", XM, yFront, W, H],
  ["LEFT", X0, yBase, H, D], ["RIGHT", XR, yBase, H, D], ["LID", XM, yLidTop, W, D],
  ["TUCK", XM, yTuck, W, TUCK], ["L-FLAP", X0, yLidTop, H, D], ["R-FLAP", XR, yLidTop, H, D],
  ["DUST", X0, yBase - DUST, H, DUST], ["DUST", XR, yBase - DUST, H, DUST],
  ["DUST", X0, yFront, H, DUST], ["DUST", XR, yFront, H, DUST],
  ["ROLL", XM, yRoll, W, ROLL],
];

const EDITOR_W = 1128, EDITOR_H = 1662;
const SX = EDITOR_W / DIELINE_W, SY = EDITOR_H / DIELINE_H;

const elements = [];
let n = 0;
for (const [label, x, y, w, h] of PANELS) {
  const px = x * SX, py = y * SY, pw = w * SX, ph = h * SY;
  const size = Math.max(18, Math.min(pw, ph) * 0.3);
  const text = (t, ty, fs, fill) => ({
    id: `diag-${(n += 1)}`, type: "text", text: t,
    x: px + pw / 2 - (t.length * fs * 0.55) / 2, y: ty,
    fontFamily: "Arial, Helvetica, sans-serif", fontSize: fs, fill,
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  });
  // Arrow points toward dieline-up; the label reveals mirroring and rotation.
  elements.push(text("^", py + ph * 0.16 - size * 0.4, size * 0.9, "#c8102e"));
  elements.push(text(label, py + ph * 0.52 - size / 2, size, "#12315e"));
}

const seedDesign = {
  productId,
  surfaces: { outside: { elements, background: "#f3ece0" } },
};



const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

if (productId === "mailer-box-001") await page.addInitScript(
  ([key, value]) => window.localStorage.setItem(key, value),
  [`configurator:design:${productId}`, JSON.stringify(seedDesign)],
);
await page.goto(`http://localhost:${port}/studio?product=${encodeURIComponent(productId)}`);
await waitForModel(page);

const preview = page.locator("section[aria-label='3D preview']");
const primary = page.locator("[data-unfold-action='primary']");
const status = page.locator("[data-unfold-status]");

if (!(await primary.count())) {
  console.error(`FAIL: ${productId} exposes no structural control`);
  await browser.close();
  process.exit(2);
}

await page.screenshot({ path: `${outDir}/studio-2d-and-3d.png` });

// Open/close products (a clamshell has no flat pose) expose a toggle, not a
// step counter. Capture both poses and stop.
if (!(await status.count())) {
  await preview.screenshot({ path: `${outDir}/closed.png` });
  const openLabel = (await primary.textContent())?.trim();
  await primary.click();
  await page.waitForTimeout(1600);
  await preview.screenshot({ path: `${outDir}/open.png` });
  const closeLabel = (await primary.textContent())?.trim();
  await primary.click();
  await page.waitForTimeout(1600);
  await preview.screenshot({ path: `${outDir}/closed-again.png` });
  await browser.close();
  if (openLabel === closeLabel) {
    console.error(`FAIL: the toggle label did not change ("${openLabel}")`);
    process.exit(2);
  }
  console.log(`OPEN/CLOSE PASS — "${openLabel}" / "${closeLabel}" captured in ${outDir}`);
  process.exit(0);
}

const seen = [];
let index = 0;
for (;;) {
  const label = (await primary.textContent())?.trim() ?? "";
  const caption = (await status.count()) ? ((await status.textContent())?.trim() ?? "") : "";
  const file = `${outDir}/stage-${String(index).padStart(2, "0")}.png`;
  await preview.screenshot({ path: file });
  seen.push({ stage: index, caption, next: label });
  console.log(`stage ${index}: ${caption || "(toggle)"} — next: "${label}"`);
  if (caption === "Fully unfolded" || index > 20) break;
  await primary.click();
  // Let the exponential hinge easing settle before the next capture.
  await page.waitForTimeout(1400);
  index += 1;
}

const captions = seen.map((s) => s.caption);
if (captions.at(-1) !== "Fully unfolded") {
  console.error("FAIL: the sequence never reached a fully unfolded state");
  await browser.close();
  process.exit(2);
}
if (new Set(captions).size !== captions.length) {
  console.error("FAIL: the step counter did not advance on every click");
  await browser.close();
  process.exit(2);
}

// Rapid-click safety: hammer the control, then reverse and reset.
for (let i = 0; i < 12; i += 1) await primary.click({ delay: 20 });
await page.waitForTimeout(1200);
await page.locator("[data-unfold-action='reset']").click();
await page.waitForTimeout(1800);
await preview.screenshot({ path: `${outDir}/stage-reset.png` });
const resetCaption = (await status.textContent())?.trim();
if (resetCaption !== `Step 1 of ${seen.length - 1}`) {
  console.error(`FAIL: reset landed on "${resetCaption}" instead of the assembled pose`);
  await browser.close();
  process.exit(2);
}

await browser.close();
console.log(`\nUNFOLD PASS — ${seen.length} stages captured in ${outDir}`);
