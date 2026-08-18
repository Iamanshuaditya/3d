import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 250)));
page.on("console", m => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 200)); });
await page.goto("http://localhost:3000/studio?product=mailer-box-001", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(7000);
await page.screenshot({ path: "/tmp/mailer-closed.png" });
// try the open control if present
try {
  const open = page.getByText(/open lid/i).first();
  await open.click({ timeout: 3000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "/tmp/mailer-open.png" });
} catch { console.log("no open control found"); }
await browser.close();
console.log("shots saved");
