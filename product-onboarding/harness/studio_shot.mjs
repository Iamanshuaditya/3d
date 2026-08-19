import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const id of ["camera-001", "pouch-002"]) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on("pageerror", e => console.log(`[${id} pageerror]`, String(e).slice(0, 200)));
  await page.goto(`http://localhost:3457/studio?product=${id}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(9000); // GLB load + first render
  // try to add a text element through the real editor UI
  const textBtn = page.getByRole("button", { name: /text/i }).first();
  try { await textBtn.click({ timeout: 3000 }); await page.waitForTimeout(2500); } catch {}
  await page.screenshot({ path: `products/${id}/validation/studio.png` });
  console.log(`saved studio shot for ${id}`);
  await page.close();
}
await browser.close();
