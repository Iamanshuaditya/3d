// Loads every registered product family in the real studio and asserts each
// one still renders. Guards the packaging SKUs against the garment/unfolding
// work — a product that stops loading fails the run, it does not just look odd.
import { chromium } from "playwright-core";
import { waitForModel } from "./lib_wait.mjs";
import { mkdirSync } from "node:fs";

const [outDir, port = "3000"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const PRODUCTS = [
  ["mailer-box-001", "folded carton (progressive unfold)"],
  ["burger-box-001", "tapered clamshell (open/close)"],
  ["pouch-001", "GLB stand-up pouch (clear-barrier gloss)"],
  ["meshy-pouch-001", "GLB pouch (glossy laminate)"],
  ["gen-pouch-test", "parametric pouch geometry"],
  ["mug", "onboarded GLB (wrap strategy)"],
  ["soda-can", "onboarded GLB (wrap strategy)"],
  ["camera-001", "onboarded GLB (multi-region)"],
  ["pouch-002", "onboarded GLB (shared web)"],
  ["bottle-001", "hand-authored GLB"],
  ["tshirt", "garment (cotton fabric, embroidery capable)"],
  ["counter-display", "articulated GLB (authored hinge graph)"],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;

for (const [id, description] of PRODUCTS) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const problems = [];
  page.on("pageerror", (e) => problems.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text().slice(0, 160));
  });

  try {
    await page.goto(`http://localhost:${port}/studio?product=${id}`);
    await waitForModel(page);
    await page.waitForTimeout(1200);

    const invalid = await page.locator("text=Product model invalid").count();
    // A blank frame means the model silently failed; sample the canvas.
    const painted = await page.evaluate(() => {
      const canvas = document.querySelector("section[aria-label='3D preview'] canvas");
      if (!canvas) return 0;
      const probe = document.createElement("canvas");
      probe.width = 60;
      probe.height = 60;
      const ctx = probe.getContext("2d");
      ctx.drawImage(canvas, 0, 0, 60, 60);
      const { data } = ctx.getImageData(0, 0, 60, 60);
      let distinct = new Set();
      for (let i = 0; i < data.length; i += 4) {
        distinct.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      }
      return distinct.size;
    });

    await page.locator("section[aria-label='3D preview']").screenshot({
      path: `${outDir}/${id}.png`,
    });

    const ok = invalid === 0 && painted > 3 && problems.length === 0;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${id.padEnd(17)} ${description.padEnd(42)} ` +
        `shades=${painted}${invalid ? " INVALID-MODEL" : ""}` +
        (problems.length ? ` errors=${problems[0]}` : ""),
    );
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${id.padEnd(17)} ${String(error).slice(0, 120)}`);
  }
  await page.close();
}

await browser.close();
console.log(`\n${PRODUCTS.length - failures}/${PRODUCTS.length} products render`);
process.exit(failures ? 2 : 0);
