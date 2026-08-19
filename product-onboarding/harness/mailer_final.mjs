import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
await page.goto("http://localhost:3000/studio?product=mailer-box-001", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(7000);
try {
  // select the Lid section first so contentRotation applies to new text
  await page.getByText(/^lid$/i).first().click({ timeout: 4000 }).catch(()=>{});
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^text$/i }).first().click({ timeout: 3000 }).catch(()=>{});
  await page.getByText(/add text/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(2500);
} catch {}
await page.screenshot({ path: "/tmp/mailer-final-closed.png" });
try {
  await page.getByText(/open lid/i).first().click({ timeout: 3000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "/tmp/mailer-final-open.png" });
} catch {}
await browser.close();
console.log("final shots saved");
