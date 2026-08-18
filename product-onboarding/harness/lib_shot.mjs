import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(6000);
await p.screenshot({ path: "/tmp/library.png", fullPage: true });
await b.close();
console.log("saved");
