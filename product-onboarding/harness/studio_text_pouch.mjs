import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://localhost:3000/studio?product=pouch-002", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(9000);
try { await page.getByRole("button", { name: /^text$/i }).first().click({ timeout: 5000 }); } catch {}
await page.waitForTimeout(1500);
await page.getByText(/add text/i).first().click({ timeout: 15000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: "products/pouch-002/validation/studio-text.png" });
console.log("saved");
await browser.close();
