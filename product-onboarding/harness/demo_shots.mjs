// Screenshot every demo product's studio page into a contact-sheet folder.
import { chromium } from "playwright-core";
const ids = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on("pageerror", e => console.log(`[${id}]`, String(e).slice(0, 120)));
  await page.goto(`http://localhost:3000/studio?product=${id}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(6000);
  try {
    await page.getByRole("button", { name: /^text$/i }).first().click({ timeout: 3000 });
    await page.waitForTimeout(800);
    await page.getByText(/add text/i).first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch {}
  await page.screenshot({ path: `/tmp/demo-${id}.png` });
  console.log(`shot ${id}`);
  await page.close();
}
await browser.close();
